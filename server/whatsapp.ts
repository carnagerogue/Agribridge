import { randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import type { Database, Queryable } from "./db.js";
import type { AppConfig } from "./config.js";
import {
  ApiError,
  requireOperator,
  sha256,
  type AuthRequest,
  type User,
} from "./security.js";
import { audit } from "./store.js";
import {
  getChannelReadiness,
  sendOutbound,
  type InboundEvent,
  type DeliveryEvent,
  type OutboundResult,
} from "./channels/index.js";
import { reserveMessageBudget } from "./messaging-budget.js";

export const WHATSAPP_RETENTION_DAYS = 30;
const DAY = 86_400_000;
const iso = (value: Date | string) => new Date(value).toISOString();
type InboxRow = {
  id: string;
  tenant_id: string;
  from_number: string;
  contact_id: string | null;
  contact_name?: string | null;
  body: string | null;
  content_type: string;
  command: string;
  occurred_at: Date | string;
  received_at: Date | string;
  expires_at: Date | string;
  sample: boolean;
  truncated: boolean;
  pending_reply?: boolean;
  last_request_at: Date | string | null;
  last_stop_at: Date | string | null;
};
type ReplyRow = {
  id: string;
  inbox_id: string;
  request_hash: string;
  body: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  status: string;
  error: string | null;
  provider_id: string | null;
  delivery_uncertain: boolean;
  sample: boolean;
};

export function whatsappConnection(
  user: User,
  config: Pick<AppConfig, "demo">,
  env: NodeJS.ProcessEnv,
) {
  const scoped = env.CHANNEL_ORGANIZATION_ID === user.organizationId;
  const numberReady = /^\+[1-9]\d{7,14}$/.test(
    env.WHATSAPP_BUSINESS_NUMBER || "",
  );
  const sendReady =
    getChannelReadiness(env).find((item) => item.id === "whatsapp")?.status ===
    "configured";
  const hooksReady = Boolean(
    env.WHATSAPP_APP_SECRET?.trim() && env.WHATSAPP_VERIFY_TOKEN?.trim(),
  );
  const checklist = [
    { id: "organization", label: "Organization routing", ready: scoped },
    {
      id: "business_number",
      label: "Public support number",
      ready: scoped && numberReady,
    },
    {
      id: "send_credentials",
      label: "WhatsApp sending configuration",
      ready: scoped && sendReady,
    },
    {
      id: "webhook_verification",
      label: "Signed incoming message configuration",
      ready: scoped && hooksReady,
    },
  ];
  const configured = checklist.every((item) => item.ready);
  const status = config.demo
    ? "demo"
    : configured
      ? "configured"
      : "not_configured";
  return {
    status,
    businessNumber:
      status === "configured" ? env.WHATSAPP_BUSINESS_NUMBER! : null,
    chatUrl:
      status === "configured"
        ? `https://wa.me/${env.WHATSAPP_BUSINESS_NUMBER!.slice(1)}`
        : null,
    checklist,
    detail:
      status === "demo"
        ? "Sample inbox only. WhatsApp delivery and public chat links are disabled in this demonstration."
        : status === "configured"
          ? "Setup is present, not a live-delivery guarantee. Send a support question to start a conversation; replies depend on staff availability."
          : "WhatsApp support has not been fully configured for this organization.",
  };
}

/** At reads and writes, redact expired bodies. Backups/provider retention remain deployment responsibilities. */
export async function expireWhatsAppBodies(
  db: Queryable,
  tenant: string,
  now = new Date(),
) {
  for (const table of ["whatsapp_inbox", "whatsapp_replies"])
    await db.query(
      `UPDATE ${table} SET body=NULL WHERE tenant_id=$1 AND expires_at<=$2 AND body IS NOT NULL`,
      [tenant, now.toISOString()],
    );
}

/** Only call inside the verified callback's deduplication transaction. */
export async function persistWhatsAppInbound(
  db: Queryable,
  tenant: string,
  event: InboundEvent,
  options: { sample?: boolean; now?: Date; id?: string } = {},
) {
  const now = options.now || new Date();
  await expireWhatsAppBodies(db, tenant, now);
  const occurred = new Date(
    Math.min(Date.parse(event.occurredAt), now.getTime()),
  );
  const expires = new Date(
    Math.min(occurred.getTime(), now.getTime()) + WHATSAPP_RETENTION_DAYS * DAY,
  );
  const contentType =
    event.contentType === "unsupported" ? "unsupported" : "text";
  const body =
    expires <= now
      ? null
      : contentType === "unsupported"
        ? "[Non-text message received. Media is not downloaded.]"
        : event.body
            .replace(
              /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
              "",
            )
            .trim()
            .slice(0, 1600);
  const contact = await db.query<{ id: string }>(
    `SELECT id FROM entities WHERE tenant_id=$1 AND type='contacts' AND data->>'phone'=$2 ORDER BY created_at,id LIMIT 1`,
    [tenant, event.from],
  );
  const id = options.id || randomUUID();
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO whatsapp_inbox(id,tenant_id,provider_event_id,from_number,contact_id,body,content_type,command,occurred_at,received_at,expires_at,sample,truncated) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(tenant_id,provider_event_id) DO NOTHING RETURNING id`,
    [
      id,
      tenant,
      event.eventId,
      event.from,
      contact.rows[0]?.id || null,
      body,
      contentType,
      event.command,
      occurred.toISOString(),
      now.toISOString(),
      expires.toISOString(),
      options.sample === true,
      event.body.length > 1600,
    ],
  );
  if (!inserted.rows.length) return;
  const request = ["message", "help"].includes(event.command)
    ? occurred.toISOString()
    : null;
  const stop = event.command === "stop" ? occurred.toISOString() : null;
  await db.query(
    `INSERT INTO whatsapp_threads(tenant_id,from_number,last_request_at,last_stop_at) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,from_number) DO UPDATE SET last_request_at=GREATEST(whatsapp_threads.last_request_at,EXCLUDED.last_request_at),last_stop_at=GREATEST(whatsapp_threads.last_stop_at,EXCLUDED.last_stop_at)`,
    [tenant, event.from, request, stop],
  );
  return id;
}

export async function stopWhatsAppSupport(
  db: Queryable,
  tenant: string,
  phone: string,
  occurredAt: string,
) {
  await db.query(
    `INSERT INTO whatsapp_threads(tenant_id,from_number,last_stop_at) VALUES($1,$2,$3) ON CONFLICT(tenant_id,from_number) DO UPDATE SET last_stop_at=GREATEST(whatsapp_threads.last_stop_at,EXCLUDED.last_stop_at)`,
    [tenant, phone, occurredAt],
  );
}

export async function applyWhatsAppDelivery(
  db: Queryable,
  tenant: string,
  event: DeliveryEvent,
) {
  if (event.channel !== "whatsapp") return;
  await expireWhatsAppBodies(db, tenant);
  await db.query(
    `UPDATE whatsapp_replies SET status=CASE WHEN status='delivered' OR (status='failed' AND $3 IN ('queued','sent')) OR (status='sent' AND $3='queued') THEN status ELSE $3 END,delivery_uncertain=false WHERE tenant_id=$1 AND provider_id=$2`,
    [tenant, event.providerId, event.status],
  );
}

function availability(
  row: InboxRow,
  config: Pick<AppConfig, "demo">,
  env: NodeJS.ProcessEnv,
  user: User,
  now = Date.now(),
) {
  const last = row.last_request_at
    ? new Date(row.last_request_at).getTime()
    : 0;
  const stopped = row.last_stop_at ? new Date(row.last_stop_at).getTime() : 0;
  const replyWindowExpiresAt = last ? new Date(last + DAY).toISOString() : null;
  const reason =
    config.demo || row.sample
      ? "demo"
      : new Date(row.expires_at).getTime() <= now
        ? "expired"
        : stopped && stopped >= last
          ? "stopped"
          : !last || last + DAY <= now
            ? "window_expired"
            : whatsappConnection(user, config, env).status !== "configured"
              ? "not_configured"
              : row.pending_reply
                ? "reply_unresolved"
                : null;
  return {
    replyWindowExpiresAt,
    canReply: reason === null,
    replyBlockedReason: reason,
  };
}
function presentReply(row: ReplyRow, now = Date.now()) {
  return {
    id: row.id,
    body: new Date(row.expires_at).getTime() > now ? row.body : null,
    createdAt: iso(row.created_at),
    status: row.status,
    deliveryUncertain: row.delivery_uncertain,
    error: row.error,
    sample: row.sample,
  };
}
const inboxSelect = `SELECT i.*,t.last_request_at,t.last_stop_at,c.data->>'name' AS contact_name,EXISTS(SELECT 1 FROM whatsapp_replies r JOIN whatsapp_inbox p ON p.id=r.inbox_id AND p.tenant_id=r.tenant_id WHERE p.tenant_id=i.tenant_id AND p.from_number=i.from_number AND (r.delivery_uncertain=true OR r.status='queued')) AS pending_reply FROM whatsapp_inbox i LEFT JOIN whatsapp_threads t ON t.tenant_id=i.tenant_id AND t.from_number=i.from_number LEFT JOIN entities c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id AND c.type='contacts' AND c.data->>'phone'=i.from_number`;
async function getInbox(
  db: Queryable,
  tenant: string,
  id: string,
  lock = false,
) {
  const { rows } = await db.query<InboxRow>(
    `${inboxSelect} WHERE i.tenant_id=$1 AND i.id=$2${lock ? " FOR UPDATE OF i" : ""}`,
    [tenant, id],
  );
  if (!rows[0])
    throw new ApiError(404, "NOT_FOUND", "WhatsApp message not found.");
  return rows[0];
}

export function mountWhatsApp(
  app: Express,
  db: Database,
  config: AppConfig,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
) {
  app.get("/api/whatsapp/connection", (req: AuthRequest, res) =>
    res.json(whatsappConnection(req.user!, config, env)),
  );
  app.get(
    "/api/whatsapp/inbox",
    requireOperator,
    async (req: AuthRequest, res) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(500).optional(),
        })
        .strict()
        .parse(req.query);
      let cursor: { at: string; id: string } | undefined;
      if (query.cursor)
        try {
          cursor = z
            .object({
              at: z.string().datetime(),
              id: z.string().min(1).max(80),
            })
            .strict()
            .parse(
              JSON.parse(
                Buffer.from(query.cursor, "base64url").toString("utf8"),
              ),
            );
        } catch {
          throw new ApiError(
            400,
            "INVALID_CURSOR",
            "The inbox cursor is invalid.",
          );
        }
      const tenant = req.user!.organizationId;
      await expireWhatsAppBodies(db, tenant);
      const values: unknown[] = [tenant, query.limit + 1];
      if (cursor) values.push(cursor.at, cursor.id);
      const { rows } = await db.query<InboxRow>(
        `${inboxSelect} WHERE i.tenant_id=$1${cursor ? " AND (i.received_at,i.id)<($3::timestamptz,$4)" : ""} ORDER BY i.received_at DESC,i.id DESC LIMIT $2`,
        values,
      );
      const items = rows.slice(0, query.limit);
      const ids = items.map((row) => row.id);
      const replies = await db.query<ReplyRow>(
        `SELECT * FROM (SELECT r.*,row_number() OVER(PARTITION BY inbox_id ORDER BY created_at DESC,id DESC) AS position FROM whatsapp_replies r WHERE tenant_id=$1 AND inbox_id=ANY($2::text[])) recent WHERE position<=10 ORDER BY created_at DESC,id DESC`,
        [tenant, ids],
      );
      const last = items.at(-1);
      res.json({
        items: items.map((row) => ({
          id: row.id,
          from: row.from_number,
          body:
            new Date(row.expires_at).getTime() > Date.now() ? row.body : null,
          contentType: row.content_type,
          command: row.command,
          occurredAt: iso(row.occurred_at),
          receivedAt: iso(row.received_at),
          contact:
            row.contact_id && row.contact_name
              ? { id: row.contact_id, name: row.contact_name }
              : null,
          ...availability(row, config, env, req.user!),
          replies: replies.rows
            .filter((reply) => reply.inbox_id === row.id)
            .map((reply) => presentReply(reply)),
          sample: row.sample,
          truncated: row.truncated,
        })),
        nextCursor:
          rows.length > query.limit && last
            ? Buffer.from(
                JSON.stringify({ at: iso(last.received_at), id: last.id }),
              ).toString("base64url")
            : null,
        retentionDays: WHATSAPP_RETENTION_DAYS,
      });
    },
  );
  app.post(
    "/api/whatsapp/inbox/:id/reply",
    requireOperator,
    async (req: AuthRequest, res) => {
      const input = z
        .object({
          body: z
            .string()
            .trim()
            .min(1)
            .max(1600)
            .refine(
              (value) =>
                !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
            ),
        })
        .strict()
        .parse(req.body);
      const key = z.string().uuid().parse(req.get("idempotency-key"));
      const id = z.string().min(1).max(80).parse(req.params.id);
      const user = req.user!;
      const tenant = user.organizationId;
      const fingerprint = sha256(`${id}:${input.body}`);
      const existing = async (tx: Queryable) => {
        const { rows } = await tx.query<ReplyRow>(
          `SELECT * FROM whatsapp_replies WHERE tenant_id=$1 AND actor_id=$2 AND idempotency_key=$3`,
          [tenant, user.id, key],
        );
        const row = rows[0];
        if (row && row.request_hash !== fingerprint)
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This request key was already used for a different reply.",
          );
        return row;
      };
      let reserved: { row: ReplyRow; fresh: boolean };
      try {
        reserved = await db.transaction(async (tx) => {
          await expireWhatsAppBodies(tx, tenant);
          const previous = await existing(tx);
          if (previous) return { row: previous, fresh: false };
          const incoming = await getInbox(tx, tenant, id, true);
          const thread = await tx.query<{
            last_request_at: Date | string | null;
            last_stop_at: Date | string | null;
          }>(
            `SELECT last_request_at,last_stop_at FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
            [tenant, incoming.from_number],
          );
          const state = availability(
            { ...(await getInbox(tx, tenant, id)), ...thread.rows[0] },
            config,
            env,
            user,
          );
          if (!state.canReply)
            throw new ApiError(
              409,
              "WHATSAPP_REPLY_BLOCKED",
              `Reply unavailable: ${state.replyBlockedReason}. A new direct support request may be needed.`,
            );
          const now = new Date();
          const replyId = randomUUID();
          const { rows } = await tx.query<ReplyRow>(
            `INSERT INTO whatsapp_replies(id,tenant_id,inbox_id,actor_id,idempotency_key,request_hash,body,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              replyId,
              tenant,
              id,
              user.id,
              key,
              fingerprint,
              input.body,
              now.toISOString(),
              new Date(
                now.getTime() + WHATSAPP_RETENTION_DAYS * DAY,
              ).toISOString(),
            ],
          );
          await audit(
            tx,
            user,
            "whatsapp.reply_requested",
            "whatsapp",
            replyId,
          );
          return { row: rows[0], fresh: true };
        });
      } catch (error) {
        const previous = await existing(db);
        if (!previous) throw error;
        reserved = { row: previous, fresh: false };
      }
      if (reserved.fresh) {
        // A durable reservation is never reclaimed. Crashes/unknown provider results require
        // reconciliation, not automatic resend. Provider calls never run in a DB transaction.
        const allowed = await reserveMessageBudget(
          db,
          tenant,
          (await getInbox(db, tenant, id)).from_number,
          env,
        );
        const dispatch = await db.transaction(async (tx) => {
          const incoming = await getInbox(tx, tenant, id);
          const { rows } = await tx.query<{
            last_request_at: Date | string | null;
            last_stop_at: Date | string | null;
          }>(
            `SELECT last_request_at,last_stop_at FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
            [tenant, incoming.from_number],
          );
          const state = availability(
            { ...incoming, ...rows[0], pending_reply: false },
            config,
            env,
            user,
          );
          return { incoming: { ...incoming, ...rows[0] }, state };
        });
        let result: OutboundResult;
        if (!allowed)
          result = {
            status: "failed",
            error: "Daily messaging allowance reached.",
            deliveryUncertain: false,
          };
        else if (!dispatch.state.canReply)
          result = {
            status: "failed",
            error: `Reply blocked: ${dispatch.state.replyBlockedReason}.`,
            deliveryUncertain: false,
          };
        else
          result = await sendOutbound(
            {
              channel: "whatsapp",
              to: dispatch.incoming.from_number,
              body: input.body,
              idempotencyKey: reserved.row.id,
              consent: true,
              lastInboundAt: iso(dispatch.incoming.last_request_at!),
            },
            { env, fetchImpl },
          );
        await db.transaction(async (tx) => {
          // Share the receipt row lock with webhook UPSERTs. Provider acceptance is
          // recorded as sent/queued, never delivered; callbacks may advance it.
          if (result.providerId)
            await tx.query(
              `INSERT INTO channel_deliveries(tenant_id,provider_id,status,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
              [
                tenant,
                result.providerId,
                result.status,
                new Date().toISOString(),
              ],
            );
          const receipt = result.providerId
            ? await tx.query<{ status: string }>(
                `SELECT status FROM channel_deliveries WHERE tenant_id=$1 AND provider_id=$2 FOR UPDATE`,
                [tenant, result.providerId],
              )
            : { rows: [] };
          const status = receipt.rows[0]?.status || result.status;
          await tx.query(
            `UPDATE whatsapp_replies SET status=CASE WHEN status='delivered' OR (status='failed' AND $3 IN ('queued','sent')) OR (status='sent' AND $3='queued') THEN status ELSE $3 END,provider_id=$4,error=$5,delivery_uncertain=CASE WHEN status IN ('delivered','sent') THEN false ELSE $6 END WHERE tenant_id=$1 AND id=$2`,
            [
              tenant,
              reserved.row.id,
              status,
              result.providerId || null,
              result.error || null,
              receipt.rows.length ? false : result.deliveryUncertain === true,
            ],
          );
          await audit(
            tx,
            user,
            `whatsapp.reply_${status}`,
            "whatsapp",
            reserved.row.id,
          );
        });
      }
      const saved = await existing(db);
      res.status(reserved.fresh ? 201 : 200).json(presentReply(saved!));
    },
  );
}
