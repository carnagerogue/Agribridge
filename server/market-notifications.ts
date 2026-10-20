import { randomBytes, randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Database, Queryable } from "./db.js";
import { ApiError, sha256, type AuthRequest } from "./security.js";
import { audit, mutate } from "./store.js";
import { getChannelReadiness, sendOutbound } from "./channels/index.js";
import type {
  DeliveryEvent,
  InboundEvent,
  OutboundMessage,
  OutboundResult,
} from "./channels/types.js";
import { reserveMessageBudget } from "./messaging-budget.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const kinds = [
  "payment_approved",
  "payment_confirmed",
  "payment_failed",
  "payment_refunded",
] as const;
type NotificationKind = (typeof kinds)[number];
type Language = "en" | "lg";
type Binding = {
  tenant_id: string;
  owner_id: string;
  phone: string;
  payment_consent: boolean;
  language: Language;
  verified_at: Date | string;
  consent_at: Date | string | null;
};
type Notification = {
  id: string;
  tenant_id: string;
  recipient_id: string;
  payment_id: string;
  kind: NotificationKind;
  body: string;
  created_at: Date | string;
  amount_ugx: string | number;
  order_id: string;
  provider: string;
  payment_status: string;
};
const asDate = (value: Date | string) => new Date(value);
const masked = (phone: string) => `${phone.slice(0, 4)}•••••${phone.slice(-3)}`;
const templateName = (
  env: NodeJS.ProcessEnv,
  kind: NotificationKind,
  language: Language,
) => {
  const suffix = kind.replace("payment_", "").toUpperCase();
  const value =
    env[`MARKET_PAYMENT_TEMPLATE_${suffix}_${language.toUpperCase()}`]?.trim();
  return value && /^[a-z0-9_]{1,128}$/.test(value) ? value : undefined;
};
const languageCode = (env: NodeJS.ProcessEnv, language: Language) => {
  const value =
    env[`MARKET_PAYMENT_TEMPLATE_LANGUAGE_${language.toUpperCase()}`] ||
    language;
  return /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(value) ? value : undefined;
};
export function getMarketNotificationReadiness(
  env: NodeJS.ProcessEnv = process.env,
) {
  const templateConfigured = kinds.some((kind) =>
    (["en", "lg"] as const).some((language) =>
      Boolean(templateName(env, kind, language) && languageCode(env, language)),
    ),
  );
  const transport =
    getChannelReadiness(env).find((item) => item.id === "whatsapp")?.status ===
    "configured";
  return {
    enabled: env.MARKET_PAYMENT_NOTIFICATIONS_ENABLED === "true",
    configured:
      transport && Boolean(env.CHANNEL_ORGANIZATION_ID) && templateConfigured,
    templateConfigured,
    requiresVerifiedLink: true,
    requiresPaymentConsent: true,
    deliveryVerified: false,
  };
}

/** Issuance intentionally does not use the replay table: that would retain the raw linking secret. */
export async function issueMarketChannelLink(
  db: Database,
  tenantId: string,
  ownerId: string,
  now = new Date(),
) {
  const code = randomBytes(10).toString("hex").toUpperCase();
  const expiresAt = new Date(now.getTime() + 15 * MINUTE);
  await db.transaction(async (tx) => {
    await tx.query(
      `DELETE FROM market_channel_link_challenges WHERE expires_at<$1 AND tenant_id=$2`,
      [new Date(now.getTime() - DAY).toISOString(), tenantId],
    );
    await tx.query(
      `DELETE FROM market_channel_link_attempts WHERE hour_bucket<$1 AND tenant_id=$2`,
      [new Date(now.getTime() - 7 * DAY).toISOString(), tenantId],
    );
    const { rows: users } = await tx.query(
      // Serialize code issuance without blocking the KEY SHARE lock acquired
      // by a concurrent verified binding's foreign-key check. FOR UPDATE here
      // would invert the user/challenge lock order against first-time linking.
      `SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND active=true FOR NO KEY UPDATE`,
      [tenantId, ownerId],
    );
    if (!users.length)
      throw new ApiError(
        403,
        "ACCOUNT_INACTIVE",
        "An active account is required.",
      );
    const { rows } = await tx.query<{ count: string }>(
      `SELECT count(*) AS count FROM market_channel_link_challenges WHERE tenant_id=$1 AND owner_id=$2 AND created_at>$3`,
      [tenantId, ownerId, new Date(now.getTime() - HOUR).toISOString()],
    );
    if (Number(rows[0].count) >= 5)
      throw new ApiError(
        429,
        "LINK_LIMIT",
        "Too many linking codes. Please try later.",
      );
    await tx.query(
      `UPDATE market_channel_link_challenges SET consumed_at=$3 WHERE tenant_id=$1 AND owner_id=$2 AND consumed_at IS NULL`,
      [tenantId, ownerId, now.toISOString()],
    );
    await tx.query(
      `INSERT INTO market_channel_link_challenges(id,tenant_id,owner_id,code_hash,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        tenantId,
        ownerId,
        sha256(code),
        now.toISOString(),
        expiresAt.toISOString(),
      ],
    );
  });
  return {
    command: `LINK ${code}`,
    expiresAt: expiresAt.toISOString(),
    expiresInMinutes: 15,
    instruction:
      "Send this command from your WhatsApp to Agribridge. A new code replaces any earlier code. Payment updates remain off until you explicitly enable them.",
  };
}

/** Call only inside a verified provider callback's deduplication transaction, before retaining its body. */
export async function consumeMarketChannelLink(
  tx: Queryable,
  tenantId: string,
  event: InboundEvent,
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): Promise<boolean> {
  if (event.channel !== "whatsapp" || !/^LINK(?:\s|$)/i.test(event.body))
    return false;
  if (
    env.CHANNEL_ORGANIZATION_ID !== tenantId ||
    event.contentType === "unsupported"
  )
    return true;
  const occurred = Date.parse(event.occurredAt);
  if (
    !Number.isFinite(occurred) ||
    occurred > now.getTime() + 5 * MINUTE ||
    occurred < now.getTime() - 15 * MINUTE
  )
    return true;
  const bucket = new Date(
    Math.floor(now.getTime() / HOUR) * HOUR,
  ).toISOString();
  const { rows: attempts } = await tx.query<{ count: number }>(
    `INSERT INTO market_channel_link_attempts(tenant_id,phone_hash,hour_bucket,count) VALUES($1,$2,$3,1) ON CONFLICT(tenant_id,phone_hash,hour_bucket) DO UPDATE SET count=market_channel_link_attempts.count+1 RETURNING count`,
    [tenantId, sha256(event.from), bucket],
  );
  if (attempts[0].count > 20) return true;
  const code = event.body.slice(4).replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-F0-9]{20}$/.test(code)) return true;
  // All send, STOP and relink paths acquire the canonical channel row first.
  // Merely receiving an invalid code must not advance its service window.
  await tx.query(
    `INSERT INTO whatsapp_threads(tenant_id,from_number) VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [tenantId, event.from],
  );
  await tx.query(
    `SELECT from_number FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
    [tenantId, event.from],
  );
  const {
    rows: [challenge],
  } = await tx.query<{ id: string; owner_id: string }>(
    `SELECT c.id,c.owner_id FROM market_channel_link_challenges c JOIN users u ON u.tenant_id=c.tenant_id AND u.id=c.owner_id WHERE c.tenant_id=$1 AND c.code_hash=$2 AND c.consumed_at IS NULL AND c.expires_at>$3 AND c.created_at<=$4 AND u.active=true FOR UPDATE OF c`,
    [
      tenantId,
      sha256(code),
      now.toISOString(),
      new Date(occurred + 5 * MINUTE).toISOString(),
    ],
  );
  if (!challenge) return true;
  await tx.query(
    `UPDATE market_channel_link_challenges SET consumed_at=$2 WHERE id=$1`,
    [challenge.id, now.toISOString()],
  );
  const { rows: conflicts } = await tx.query(
    `SELECT owner_id FROM market_channel_bindings WHERE tenant_id=$1 AND phone=$2 AND owner_id<>$3 FOR UPDATE`,
    [tenantId, event.from, challenge.owner_id],
  );
  if (conflicts.length) return true; // A shared handset cannot silently take another account's destination.
  const { rows: profile } = await tx.query<{ language: Language }>(
    `SELECT language FROM market_profiles WHERE tenant_id=$1 AND owner_id=$2`,
    [tenantId, challenge.owner_id],
  );
  await tx.query(
    `INSERT INTO market_channel_bindings(tenant_id,owner_id,phone,language,verified_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,owner_id) DO UPDATE SET phone=excluded.phone,language=excluded.language,payment_consent=false,consent_at=NULL,verified_at=excluded.verified_at,updated_at=excluded.verified_at`,
    [
      tenantId,
      challenge.owner_id,
      event.from,
      profile[0]?.language || "en",
      now.toISOString(),
    ],
  );
  await tx.query(
    `INSERT INTO whatsapp_threads(tenant_id,from_number,last_request_at) VALUES($1,$2,$3) ON CONFLICT(tenant_id,from_number) DO UPDATE SET last_request_at=GREATEST(whatsapp_threads.last_request_at,excluded.last_request_at)`,
    [tenantId, event.from, event.occurredAt],
  );
  await tx.query(
    `UPDATE market_notification_deliveries SET status='cancelled',error_code='destination_changed',lease_token=NULL,lease_until=NULL,updated_at=$3 WHERE tenant_id=$1 AND owner_id=$2 AND status IN ('prepared','blocked')`,
    [tenantId, challenge.owner_id, now.toISOString()],
  );
  await tx.query(
    `INSERT INTO audit_events(id,tenant_id,actor_id,actor_name,action,entity_type,entity_id) VALUES($1,$2,$3,'Verified WhatsApp channel','market.channel_linked','users',$3)`,
    [randomUUID(), tenantId, challenge.owner_id],
  );
  return true;
}

export async function stopMarketPaymentNotifications(
  tx: Queryable,
  tenantId: string,
  phone: string,
  occurredAt: string,
) {
  const { rows } = await tx.query<{ owner_id: string }>(
    `UPDATE market_channel_bindings SET payment_consent=false,consent_at=NULL,updated_at=now() WHERE tenant_id=$1 AND phone=$2 AND (consent_at IS NULL OR consent_at<=$3) RETURNING owner_id`,
    [tenantId, phone, occurredAt],
  );
  for (const row of rows)
    await tx.query(
      `UPDATE market_notification_deliveries SET status='cancelled',error_code='consent_withdrawn',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND owner_id=$2 AND status IN ('prepared','blocked')`,
      [tenantId, row.owner_id],
    );
}

async function linkStatus(db: Queryable, tenantId: string, ownerId: string) {
  const {
    rows: [binding],
  } = await db.query<Binding>(
    `SELECT * FROM market_channel_bindings WHERE tenant_id=$1 AND owner_id=$2`,
    [tenantId, ownerId],
  );
  return {
    linked: Boolean(binding),
    maskedPhone: binding ? masked(binding.phone) : null,
    paymentUpdatesEnabled: binding?.payment_consent ?? false,
    language: binding?.language ?? "en",
    verifiedAt: binding ? asDate(binding.verified_at).toISOString() : null,
  };
}
export function mountMarketNotifications(
  app: Express,
  db: Database,
  _config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
) {
  app.get("/api/marketplace/channel-link", async (req: AuthRequest, res) => {
    res.json({
      ...(await linkStatus(db, req.user!.organizationId, req.user!.id)),
      readiness: getMarketNotificationReadiness(env),
    });
  });
  app.post("/api/marketplace/channel-link", async (req: AuthRequest, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    res
      .status(201)
      .json(
        await issueMarketChannelLink(
          db,
          req.user!.organizationId,
          req.user!.id,
        ),
      );
  });
  app.post(
    "/api/marketplace/channel-link/consent",
    async (req: AuthRequest, res) => {
      const input = z
        .object({
          enabled: z.boolean(),
          language: z.enum(["en", "lg"]).optional(),
        })
        .strict()
        .parse(req.body);
      const result = await mutate(db, req, async (tx) => {
        const user = req.user!;
        const {
          rows: [binding],
        } = await tx.query<Binding>(
          `SELECT * FROM market_channel_bindings WHERE tenant_id=$1 AND owner_id=$2 FOR UPDATE`,
          [user.organizationId, user.id],
        );
        if (!binding)
          throw new ApiError(
            409,
            "CHANNEL_NOT_LINKED",
            "Verify your WhatsApp channel before enabling payment updates.",
          );
        await tx.query(
          `UPDATE market_channel_bindings SET payment_consent=$3,language=$4,consent_at=CASE WHEN $3 THEN now() ELSE NULL END,updated_at=now() WHERE tenant_id=$1 AND owner_id=$2`,
          [
            user.organizationId,
            user.id,
            input.enabled,
            input.language ?? binding.language,
          ],
        );
        if (!input.enabled)
          await tx.query(
            `UPDATE market_notification_deliveries SET status='cancelled',error_code='consent_withdrawn',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND owner_id=$2 AND status IN ('prepared','blocked')`,
            [user.organizationId, user.id],
          );
        await audit(
          tx,
          user,
          input.enabled
            ? "market.payment_updates_enabled"
            : "market.payment_updates_disabled",
          "users",
          user.id,
        );
        return {
          status: 200,
          body: await linkStatus(tx, user.organizationId, user.id),
        };
      });
      res.status(result.status).json(result.body);
    },
  );
  app.post(
    "/api/marketplace/channel-link/disconnect",
    async (req: AuthRequest, res) => {
      z.object({})
        .strict()
        .parse(req.body ?? {});
      const result = await mutate(db, req, async (tx) => {
        const user = req.user!;
        // Consume and disconnect both lock challenges before bindings. Reversing
        // this order can deadlock a simultaneous signed LINK callback.
        await tx.query(
          `UPDATE market_channel_link_challenges SET consumed_at=now() WHERE tenant_id=$1 AND owner_id=$2 AND consumed_at IS NULL`,
          [user.organizationId, user.id],
        );
        await tx.query(
          `DELETE FROM market_channel_bindings WHERE tenant_id=$1 AND owner_id=$2`,
          [user.organizationId, user.id],
        );
        await tx.query(
          `UPDATE market_notification_deliveries SET status='cancelled',error_code='channel_disconnected',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE tenant_id=$1 AND owner_id=$2 AND status IN ('prepared','blocked')`,
          [user.organizationId, user.id],
        );
        await audit(tx, user, "market.channel_disconnected", "users", user.id);
        return {
          status: 200,
          body: await linkStatus(tx, user.organizationId, user.id),
        };
      });
      res.status(result.status).json(result.body);
    },
  );
}

async function blockers(tx: Queryable, tenantId: string, phone: string) {
  const { rows } = await tx.query(
    `SELECT 1 FROM whatsapp_replies r JOIN whatsapp_inbox i ON i.id=r.inbox_id AND i.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND i.from_number=$2 AND (r.status='queued' OR r.delivery_uncertain=true) UNION ALL SELECT 1 FROM market_conversation_jobs WHERE tenant_id=$1 AND phone=$2 AND status IN ('sending','uncertain') LIMIT 1`,
    [tenantId, phone],
  );
  return rows.length > 0;
}
const kindState: Record<NotificationKind, string> = {
  payment_approved: "authorized",
  payment_confirmed: "succeeded",
  payment_failed: "failed",
  payment_refunded: "refunded",
};
export async function drainMarketPaymentNotifications(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
  options: {
    send?: typeof sendOutbound;
    fetchImpl?: typeof fetch;
    now?: () => Date;
    limit?: number;
  } = {},
) {
  const counts = {
    disabled:
      env.MARKET_PAYMENT_NOTIFICATIONS_ENABLED !== "true" ||
      !env.CHANNEL_ORGANIZATION_ID?.trim(),
    sent: 0,
    demo: 0,
    waiting: 0,
    failed: 0,
    uncertain: 0,
  };
  if (counts.disabled) return counts;
  const tenantId = env.CHANNEL_ORGANIZATION_ID!;
  const clock = options.now ?? (() => new Date());
  const recoveryNow = clock().toISOString();
  // A crash after marking sending is ambiguous; never turn it back into an automatic retry.
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE market_notification_deliveries SET status='uncertain',error_code='send_interrupted',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE tenant_id=$2 AND status='sending' AND lease_until<$1`,
      [recoveryNow, tenantId],
    );
    await tx.query(
      `UPDATE market_payment_notifications n SET status='uncertain' FROM market_notification_deliveries d WHERE n.tenant_id=$1 AND d.tenant_id=n.tenant_id AND d.notification_id=n.id AND d.status='uncertain' AND n.status IN ('queued','pending_configuration')`,
      [tenantId],
    );
    // A receipt can arrive before the provider ID is attached to its delivery.
    // Reconcile durable central receipts on every pass, including uncertain sends.
    await reconcileMarketNotificationReceipts(tx, tenantId);
  });
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const examined: string[] = [];
  for (let i = 0; i < limit; i++) {
    const now = clock();
    const nowIso = now.toISOString();
    const token = randomUUID();
    const item = await db.transaction(async (tx) => {
      const {
        rows: [notification],
      } = await tx.query<Notification>(
        `SELECT n.*,p.amount_ugx,p.order_id,p.status AS payment_status FROM market_payment_notifications n JOIN market_payments p ON p.tenant_id=n.tenant_id AND p.id=n.payment_id LEFT JOIN market_notification_deliveries d ON d.notification_id=n.id WHERE n.tenant_id=$3 AND n.status IN ('pending_configuration','queued') AND NOT(n.id=ANY($2::text[])) AND (d.notification_id IS NULL OR d.status IN ('awaiting_link','awaiting_consent','awaiting_configuration','blocked') OR (d.status='prepared' AND d.lease_until<$1)) ORDER BY COALESCE(d.updated_at,n.created_at),n.id LIMIT 1 FOR UPDATE OF n SKIP LOCKED`,
        [nowIso, examined, tenantId],
      );
      if (!notification) return null;
      // Updating even a waiting row prevents repeatedly selecting it within this drain.
      const leaseUntil = new Date(now.getTime() + 2 * MINUTE).toISOString();
      await tx.query(
        `INSERT INTO market_notification_deliveries(notification_id,tenant_id,owner_id,status,lease_token,lease_until,updated_at) VALUES($1,$2,$3,'prepared',$4,$5,$6) ON CONFLICT(notification_id) DO UPDATE SET status='prepared',lease_token=excluded.lease_token,lease_until=excluded.lease_until,updated_at=excluded.updated_at`,
        [
          notification.id,
          notification.tenant_id,
          notification.recipient_id,
          token,
          leaseUntil,
          nowIso,
        ],
      );
      return notification;
    });
    if (!item) break;
    examined.push(item.id);
    const setWaiting = async (status: string, code: string, phone?: string) => {
      await db.query(
        `UPDATE market_notification_deliveries SET status=$3,error_code=$4,phone=$5,lease_token=NULL,lease_until=NULL,updated_at=$6 WHERE notification_id=$1 AND lease_token=$2`,
        [item.id, token, status, code, phone ?? null, nowIso],
      );
      counts.waiting++;
    };
    if (
      asDate(item.created_at).getTime() < now.getTime() - 7 * DAY ||
      kindState[item.kind] !== item.payment_status
    ) {
      await setWaiting(
        "cancelled",
        kindState[item.kind] !== item.payment_status
          ? "superseded_payment_status"
          : "notification_expired",
      );
      await db.query(
        `UPDATE market_payment_notifications SET status='failed' WHERE id=$1`,
        [item.id],
      );
      continue;
    }
    const {
      rows: [binding],
    } = await db.query<Binding>(
      `SELECT b.* FROM market_channel_bindings b JOIN users u ON u.tenant_id=b.tenant_id AND u.id=b.owner_id WHERE b.tenant_id=$1 AND b.owner_id=$2 AND u.active=true`,
      [item.tenant_id, item.recipient_id],
    );
    if (!binding) {
      await setWaiting("awaiting_link", "verified_channel_required");
      continue;
    }
    if (!binding.payment_consent) {
      await setWaiting(
        "awaiting_consent",
        "payment_consent_required",
        binding.phone,
      );
      continue;
    }
    const {
      rows: [thread],
    } = await db.query<{
      last_request_at: Date | string | null;
      last_stop_at: Date | string | null;
    }>(
      `SELECT last_request_at,last_stop_at FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2`,
      [item.tenant_id, binding.phone],
    );
    const lastRequest = thread?.last_request_at
      ? asDate(thread.last_request_at).getTime()
      : NaN;
    const lastStop = thread?.last_stop_at
      ? asDate(thread.last_stop_at).getTime()
      : NaN;
    if (
      Number.isFinite(lastStop) &&
      (!binding.consent_at || lastStop >= asDate(binding.consent_at).getTime())
    ) {
      await setWaiting("awaiting_consent", "consent_withdrawn", binding.phone);
      continue;
    }
    const openWindow =
      Number.isFinite(lastRequest) &&
      lastRequest <= now.getTime() &&
      now.getTime() - lastRequest < DAY;
    const template = templateName(env, item.kind, binding.language);
    const lang = languageCode(env, binding.language);
    // English text is reviewed in code; Luganda is sent only through an explicitly
    // configured account-approved translated template, including inside the window.
    const needsTemplate = !openWindow || binding.language !== "en";
    const configured =
      env.CHANNEL_ORGANIZATION_ID === item.tenant_id &&
      getChannelReadiness(env).find((c) => c.id === "whatsapp")?.status ===
        "configured";
    if (
      env.AGRIBRIDGE_DEMO !== "true" &&
      (!configured || (needsTemplate && (!template || !lang)))
    ) {
      await setWaiting(
        "awaiting_configuration",
        "transport_or_template_required",
        binding.phone,
      );
      continue;
    }
    if (
      await db.transaction((tx) => blockers(tx, item.tenant_id, binding.phone))
    ) {
      await setWaiting(
        "blocked",
        "conversation_requires_reconciliation",
        binding.phone,
      );
      continue;
    }
    if (env.AGRIBRIDGE_DEMO === "true") {
      await db.query(
        `UPDATE market_notification_deliveries SET phone=$3,status='demo',error_code='demo_delivery_disabled',lease_token=NULL,lease_until=NULL,updated_at=$4 WHERE notification_id=$1 AND lease_token=$2`,
        [item.id, token, binding.phone, nowIso],
      );
      counts.demo++;
      continue;
    }
    if (
      !(await reserveMessageBudget(
        db,
        item.tenant_id,
        binding.phone,
        env,
        nowIso.slice(0, 10),
      ))
    ) {
      await setWaiting(
        "awaiting_configuration",
        "message_budget_exhausted",
        binding.phone,
      );
      continue;
    }
    const dispatchNow = clock();
    const dispatchIso = dispatchNow.toISOString();
    const ready = await db.transaction(async (tx) => {
      await tx.query(
        `SELECT from_number FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
        [item.tenant_id, binding.phone],
      );
      const {
        rows: [current],
      } = await tx.query<
        Binding & {
          last_request_at: Date | string | null;
          last_stop_at: Date | string | null;
        }
      >(
        `SELECT b.*,t.last_request_at,t.last_stop_at FROM market_channel_bindings b JOIN users u ON u.tenant_id=b.tenant_id AND u.id=b.owner_id JOIN whatsapp_threads t ON t.tenant_id=b.tenant_id AND t.from_number=b.phone WHERE b.tenant_id=$1 AND b.owner_id=$2 AND b.phone=$3 AND b.payment_consent=true AND b.verified_at=$4 AND b.language=$5 AND b.consent_at=$6 AND u.active=true`,
        [
          item.tenant_id,
          item.recipient_id,
          binding.phone,
          asDate(binding.verified_at).toISOString(),
          binding.language,
          binding.consent_at ? asDate(binding.consent_at).toISOString() : null,
        ],
      );
      if (!current || (await blockers(tx, item.tenant_id, binding.phone)))
        return false;
      const currentStop = current.last_stop_at
        ? asDate(current.last_stop_at).getTime()
        : NaN;
      if (
        Number.isFinite(currentStop) &&
        (!current.consent_at ||
          currentStop >= asDate(current.consent_at).getTime())
      )
        return false;
      const currentRequest = current.last_request_at
        ? asDate(current.last_request_at).getTime()
        : NaN;
      const currentWindow =
        Number.isFinite(currentRequest) &&
        currentRequest <= dispatchNow.getTime() &&
        dispatchNow.getTime() - currentRequest < DAY;
      if (!needsTemplate && !currentWindow) return false;
      const {
        rows: [payment],
      } = await tx.query<{ status: string }>(
        `SELECT status FROM market_payments WHERE tenant_id=$1 AND id=$2`,
        [item.tenant_id, item.payment_id],
      );
      if (!payment || payment.status !== kindState[item.kind]) return false;
      const { rows: existing } = await tx.query(
        `SELECT 1 FROM market_notification_deliveries WHERE tenant_id=$1 AND phone=$2 AND notification_id<>$3 AND status IN ('sending','uncertain') LIMIT 1`,
        [item.tenant_id, binding.phone, item.id],
      );
      if (existing.length) return false;
      const { rows: changed } = await tx.query(
        `UPDATE market_notification_deliveries SET status='sending',phone=$3,attempted_at=$4,lease_until=$5,updated_at=$4 WHERE notification_id=$1 AND lease_token=$2 AND status='prepared' RETURNING notification_id`,
        [
          item.id,
          token,
          binding.phone,
          dispatchIso,
          new Date(dispatchNow.getTime() + 2 * MINUTE).toISOString(),
        ],
      );
      if (!changed.length) return false;
      await tx.query(
        `UPDATE market_payment_notifications SET status='queued' WHERE id=$1`,
        [item.id],
      );
      return {
        lastInboundAt: currentWindow
          ? asDate(current.last_request_at!).toISOString()
          : undefined,
      };
    });
    if (!ready) {
      await setWaiting(
        "blocked",
        "authorization_changed_or_pending_send",
        binding.phone,
      );
      continue;
    }
    const message: OutboundMessage = {
      channel: "whatsapp",
      to: binding.phone,
      body: item.body,
      idempotencyKey: item.id,
      consent: true,
      ...(ready.lastInboundAt ? { lastInboundAt: ready.lastInboundAt } : {}),
      ...(needsTemplate
        ? {
            template: {
              name: template!,
              languageCode: lang!,
              parameters: [
                new Intl.NumberFormat("en-UG").format(Number(item.amount_ugx)),
                item.order_id,
                item.provider,
              ],
            },
          }
        : {}),
    };
    let response: OutboundResult;
    try {
      response = await (options.send ?? sendOutbound)(message, {
        env,
        fetchImpl: options.fetchImpl,
        now: () => clock().getTime(),
      });
    } catch {
      response = {
        status: "failed" as const,
        deliveryUncertain: true,
        error: "provider_outcome_unknown",
      };
    }
    await db.transaction(async (tx) => {
      const { rows: early } = response.providerId
        ? await tx.query<{ status: string }>(
            `SELECT status FROM channel_deliveries WHERE tenant_id=$1 AND provider_id=$2`,
            [item.tenant_id, response.providerId],
          )
        : { rows: [] };
      const receipt = early[0]?.status;
      const status =
        receipt === "delivered" || response.status === "delivered"
          ? "delivered"
          : receipt === "failed"
            ? "failed"
            : receipt === "sent"
              ? "sent"
              : response.deliveryUncertain
                ? "uncertain"
                : response.status === "sent" || response.status === "queued"
                  ? "sent"
                  : response.status === "not_configured"
                    ? "awaiting_configuration"
                    : "failed";
      await tx.query(
        `UPDATE market_notification_deliveries SET status=$3,provider_id=$4,error_code=$5,lease_token=NULL,lease_until=NULL,updated_at=$6 WHERE notification_id=$1 AND lease_token=$2`,
        [
          item.id,
          token,
          status,
          response.providerId ?? null,
          response.error?.replace(/[^a-z0-9_:-]/gi, "_").slice(0, 100) ?? null,
          clock().toISOString(),
        ],
      );
      await tx.query(
        `UPDATE market_payment_notifications SET status=$2 WHERE id=$1`,
        [
          item.id,
          status === "awaiting_configuration"
            ? "pending_configuration"
            : status,
        ],
      );
      if (status === "sent" || status === "delivered") counts.sent++;
      else if (status === "uncertain") counts.uncertain++;
      else counts.failed++;
    });
  }
  return counts;
}

async function reconcileMarketNotificationReceipts(
  tx: Queryable,
  tenantId: string,
) {
  const { rows } = await tx.query<{
    notification_id: string;
    provider_id: string;
    status: DeliveryEvent["status"];
  }>(
    `SELECT d.notification_id,d.provider_id,c.status FROM market_notification_deliveries d JOIN channel_deliveries c ON c.tenant_id=d.tenant_id AND c.provider_id=d.provider_id WHERE d.tenant_id=$1 AND ((c.status='delivered' AND d.status IN ('sending','sent','failed','uncertain')) OR (c.status='failed' AND d.status IN ('sending','sent','uncertain')) OR (c.status='sent' AND d.status IN ('sending','uncertain'))) ORDER BY d.updated_at,d.notification_id LIMIT 200`,
    [tenantId],
  );
  for (const row of rows)
    await applyMarketNotificationDelivery(tx, tenantId, {
      eventId: "durable-receipt",
      provider: "meta",
      channel: "whatsapp",
      providerId: row.provider_id,
      status: row.status,
      occurredAt: new Date().toISOString(),
    });
}

/** Delivery callbacks are already signature-verified by the channel router. */
export async function applyMarketNotificationDelivery(
  tx: Queryable,
  tenantId: string,
  event: DeliveryEvent,
) {
  if (event.channel !== "whatsapp") return;
  const { rows } = await tx.query<{ notification_id: string; status: string }>(
    `SELECT notification_id,status FROM market_notification_deliveries WHERE tenant_id=$1 AND provider_id=$2 FOR UPDATE`,
    [tenantId, event.providerId],
  );
  const rank: Record<string, number> = {
    sending: 0,
    uncertain: 0,
    sent: 1,
    failed: 2,
    delivered: 3,
  };
  for (const row of rows) {
    if ((rank[event.status] ?? 0) <= (rank[row.status] ?? 0)) continue;
    await tx.query(
      `UPDATE market_notification_deliveries SET status=$3,error_code=NULL,updated_at=now() WHERE tenant_id=$1 AND notification_id=$2`,
      [tenantId, row.notification_id, event.status],
    );
    await tx.query(
      `UPDATE market_payment_notifications SET status=$2 WHERE id=$1`,
      [row.notification_id, event.status],
    );
  }
}
