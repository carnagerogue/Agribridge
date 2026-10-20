import { randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import { sendOutbound } from "./channels/providers.js";
import type { OutboundMessage, OutboundResult } from "./channels/types.js";
import { reserveMessageBudget } from "./messaging-budget.js";
import { listMarketDemand, listMarketServices } from "./marketplace.js";
import {
  cleanMarketText,
  marketConversationEnabled,
  prepareMarketConversationJob,
  type MarketChannelProfile,
  type MarketConversationJob,
  type MarketConversationLanguage,
  type MarketInformationRequest,
} from "./market-conversation.js";

type RetrievalContext = {
  tenantId: string;
  phone: string;
  language: MarketConversationLanguage;
  profile: MarketChannelProfile | null;
};
export type MarketConversationWorkerOptions = {
  limit?: number;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  retrieve?: (
    request: MarketInformationRequest,
    context: RetrievalContext,
  ) => Promise<string>;
  send?: (message: OutboundMessage) => Promise<OutboundResult>;
};
export type MarketConversationWorkerResult = {
  processed: number;
  sent: number;
  prepared: number;
  failed: number;
  uncertain: number;
  demo: number;
};
const WINDOW = 24 * 60 * 60 * 1000;
const LEASE = 60_000;
const unfinished = "'queued','preparing','ready','sending','uncertain'";

/** Safe default retrieval contains only active, non-sample recorded information. */
export async function retrieveMarketConversationInformation(
  db: Database,
  request: MarketInformationRequest,
  context: RetrievalContext,
): Promise<string> {
  if (request.kind === "buyers") {
    const rows = await listMarketDemand(db, context.tenantId, {
      limit: 3,
      crop: request.crop,
      district: request.district,
    });
    return rows.length
      ? rows
          .map(
            (row) =>
              `${row.organization}: ${row.crop}${row.variety ? ` / ${row.variety}` : ""}, ${row.quantityKg} kg, ${row.district}, available ${row.availableFrom} to ${row.deadline}. ${row.priceUgxPerKg === null ? "Ask the buyer for a quote." : `Recorded offer UGX ${row.priceUgxPerKg}/kg; confirm terms.`} ${row.grade ? `Required grade: ${row.grade}. ` : ""}${row.requirements}`,
          )
          .join("\n\n") +
          "\nA buyer request is not an accepted order. Ask HUMAN to discuss your produce."
      : "There is no current recorded buyer request matching these details. Tell the team your crop, quantity, community and harvest dates with SELL. Reference prices do not prove buyer demand.";
  }
  if (["inputs", "transport", "storage"].includes(request.kind)) {
    const category =
      request.kind === "inputs"
        ? "input"
        : (request.kind as "transport" | "storage");
    const rows = await listMarketServices(db, context.tenantId, {
      category,
      crop: request.crop,
      district: request.district,
      limit: 3,
    });
    return rows.length
      ? rows
          .map(
            (row) =>
              `${row.name} — ${row.provider}, ${row.district}: UGX ${row.priceUgx}/${row.unit}. Recorded ${row.observedAt}; valid until ${row.validUntil}. Source: ${row.sourceTitle}${row.sourceUrl ? ` (${row.sourceUrl})` : ""}. Status: ${row.verificationStatus}. ${row.notes}`,
          )
          .join("\n\n") +
          "\nConfirm stock, transport/storage capacity and final charges with the provider."
      : "No current recorded quote is available for these details. Ask HUMAN for an input, transport or storage quote. We do not invent prices or treat an old web page as a confirmed quote.";
  }
  return request.kind === "weather"
    ? "Please send WEATHER followed by your district. Current forecast lookup is not active in this worker; a team member can help. Missing weather is not an all-clear."
    : "Please send PRICES followed by crop, market/district and unit. Current price lookup is not active in this worker. A team member can help with dated source information; we do not invent today's price.";
}

async function claim(
  db: Database,
  now: Date,
  tenantId: string,
): Promise<MarketConversationJob | null> {
  // Recovery statements commit independently before any phone lock is acquired.
  // Keeping these locks out of the claim transaction avoids lock-order inversion
  // with an incoming STOP, which owns the canonical phone lock first.
  await db.query(
    `UPDATE market_conversation_jobs j SET status=CASE WHEN d.status='delivered' THEN 'delivered' WHEN d.status='failed' THEN 'failed' ELSE 'sent' END,lease_token=NULL,lease_until=NULL FROM channel_deliveries d WHERE j.tenant_id=$1 AND j.tenant_id=d.tenant_id AND j.provider_id=d.provider_id AND j.status IN ('sent','uncertain') AND d.status IN ('sent','delivered','failed')`,
    [tenantId],
  );
  await db.query(
    `UPDATE market_conversation_jobs SET status='uncertain',error_code='send_interrupted',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE tenant_id=$2 AND status='sending' AND lease_until<$1`,
    [now.toISOString(), tenantId],
  );
  await db.query(
    `UPDATE market_conversation_jobs SET status='queued',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE tenant_id=$2 AND status='preparing' AND lease_until<$1`,
    [now.toISOString(), tenantId],
  );
  await db.query(
    `UPDATE market_conversation_jobs SET status='expired',error_code='service_window_expired',lease_token=NULL,lease_until=NULL,updated_at=$1 WHERE tenant_id=$3 AND status IN ('queued','preparing','ready') AND event_at<=$2`,
    [
      now.toISOString(),
      new Date(now.getTime() - WINDOW).toISOString(),
      tenantId,
    ],
  );
  await db.query(
    `UPDATE market_conversation_jobs SET body=NULL,reply_body=NULL WHERE tenant_id=$2 AND expires_at<=$1 AND (body IS NOT NULL OR reply_body IS NOT NULL)`,
    [now.toISOString(), tenantId],
  );
  await db.query(
    `UPDATE market_channel_threads SET draft='{}'::jsonb,state='menu',consented=false,version=version+1 WHERE tenant_id=$2 AND updated_at<$1 AND draft<>'{}'::jsonb`,
    [new Date(now.getTime() - 30 * WINDOW).toISOString(), tenantId],
  );
  const candidate = (
    await db.query<MarketConversationJob>(
      `SELECT j.* FROM market_conversation_jobs j WHERE j.tenant_id=$2 AND j.status IN ('queued','ready') AND (j.lease_until IS NULL OR j.lease_until<=$1) AND NOT EXISTS(SELECT 1 FROM market_conversation_jobs earlier WHERE earlier.tenant_id=j.tenant_id AND earlier.phone=j.phone AND earlier.sequence<j.sequence AND earlier.status IN (${unfinished})) ORDER BY j.sequence LIMIT 1`,
      [now.toISOString(), tenantId],
    )
  ).rows[0];
  if (!candidate) return null;
  return db.transaction(async (tx) => {
    const canonical = await tx.query<{ last_stop_at: Date | string | null }>(
      `SELECT last_stop_at FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
      [candidate.tenant_id, candidate.phone],
    );
    if (!canonical.rows.length) return null;
    const { rows } = await tx.query<MarketConversationJob>(
      `SELECT j.* FROM market_conversation_jobs j WHERE j.tenant_id=$3 AND j.id=$2 AND j.status IN ('queued','ready') AND (j.lease_until IS NULL OR j.lease_until<=$1) AND NOT EXISTS(SELECT 1 FROM market_conversation_jobs earlier WHERE earlier.tenant_id=j.tenant_id AND earlier.phone=j.phone AND earlier.sequence<j.sequence AND earlier.status IN (${unfinished})) FOR UPDATE SKIP LOCKED`,
      [now.toISOString(), candidate.id, tenantId],
    );
    if (!rows[0]) return null;
    const job = rows[0];
    const stoppedAt = canonical.rows[0].last_stop_at;
    if (
      stoppedAt &&
      new Date(stoppedAt).getTime() >= new Date(job.event_at).getTime()
    ) {
      await tx.query(
        `UPDATE market_conversation_jobs SET status='cancelled',error_code='stopped',lease_token=NULL,lease_until=NULL WHERE id=$1`,
        [job.id],
      );
      return null;
    }
    const state = job.status === "ready" ? "sending" : "preparing";
    if (state === "sending") {
      // One canonical phone lock is shared with staff replies and payment notices.
      const staff = await tx.query(
        `SELECT r.id FROM whatsapp_replies r JOIN whatsapp_inbox i ON i.id=r.inbox_id AND i.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND i.from_number=$2 AND (r.delivery_uncertain=true OR r.status='queued') LIMIT 1`,
        [job.tenant_id, job.phone],
      );
      const hasNotifications = (
        await tx.query<{ present: boolean }>(
          `SELECT to_regclass('market_notification_deliveries') IS NOT NULL AS present`,
        )
      ).rows[0].present;
      const notification = hasNotifications
        ? await tx.query(
            `SELECT 1 FROM market_notification_deliveries WHERE tenant_id=$1 AND phone=$2 AND status IN ('sending','uncertain') LIMIT 1`,
            [job.tenant_id, job.phone],
          )
        : { rows: [] };
      if (staff.rows.length || notification.rows.length) {
        await tx.query(
          `UPDATE market_conversation_jobs SET error_code=$2,lease_until=$3 WHERE id=$1`,
          [
            job.id,
            "other_reply_unresolved",
            new Date(now.getTime() + LEASE).toISOString(),
          ],
        );
        return null;
      }
    }
    const token = randomUUID();
    await tx.query(
      `UPDATE market_conversation_jobs SET status=$2,lease_token=$3,lease_until=$4,attempts=attempts+1,updated_at=$5 WHERE id=$1`,
      [
        job.id,
        state,
        token,
        new Date(now.getTime() + LEASE).toISOString(),
        now.toISOString(),
      ],
    );
    return { ...job, status: state, lease_token: token };
  });
}

async function finishPreparation(
  db: Database,
  job: MarketConversationJob,
  body: string,
  now: Date,
) {
  await db.transaction(async (tx) => {
    await tx.query(
      `SELECT from_number FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
      [job.tenant_id, job.phone],
    );
    const thread = (
      await tx.query<{ paused: boolean }>(
        `SELECT paused FROM market_channel_threads WHERE tenant_id=$1 AND phone=$2 FOR UPDATE`,
        [job.tenant_id, job.phone],
      )
    ).rows[0];
    await tx.query(
      `UPDATE market_conversation_jobs SET status=$3,reply_body=$4,error_code=$5,lease_token=NULL,lease_until=NULL,updated_at=$6 WHERE id=$1 AND status='preparing' AND lease_token=$2`,
      [
        job.id,
        job.lease_token,
        thread?.paused ? "cancelled" : "ready",
        thread?.paused ? null : cleanMarketText(body),
        thread?.paused ? "automation_paused" : null,
        now.toISOString(),
      ],
    );
  });
}
async function finish(
  db: Database,
  job: MarketConversationJob,
  status: string,
  now: Date,
  error?: string,
  providerId?: string,
) {
  let savedStatus = status;
  if (providerId) {
    const receipt = (
      await db.query<{ status: string }>(
        `SELECT status FROM channel_deliveries WHERE tenant_id=$1 AND provider_id=$2`,
        [job.tenant_id, providerId],
      )
    ).rows[0];
    if (receipt?.status === "delivered") savedStatus = "delivered";
    else if (receipt?.status === "failed") savedStatus = "failed";
    else if (receipt?.status === "sent") savedStatus = "sent";
  }
  await db.query(
    `UPDATE market_conversation_jobs SET status=CASE WHEN status='delivered' THEN status ELSE $3 END,error_code=$4,provider_id=$5,lease_token=NULL,lease_until=NULL,updated_at=$6 WHERE id=$1 AND lease_token=$2`,
    [
      job.id,
      job.lease_token,
      savedStatus,
      error ?? null,
      providerId ?? null,
      now.toISOString(),
    ],
  );
}

/** One bounded worker pass. Safe to call repeatedly; no background process starts on import. */
export async function drainMarketConversationJobs(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
  options: MarketConversationWorkerOptions = {},
): Promise<MarketConversationWorkerResult> {
  const result: MarketConversationWorkerResult = {
    processed: 0,
    sent: 0,
    prepared: 0,
    failed: 0,
    uncertain: 0,
    demo: 0,
  };
  if (!marketConversationEnabled(env)) return result;
  const tenantId = env.CHANNEL_ORGANIZATION_ID?.trim();
  if (!tenantId) return result;
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20)));
  const clock = options.now ?? (() => new Date());
  const retrieve =
    options.retrieve ??
    ((request, context) =>
      retrieveMarketConversationInformation(db, request, context));
  for (let i = 0; i < limit; i++) {
    const now = clock();
    const job = await claim(db, now, tenantId);
    if (!job) break;
    if (job.tenant_id !== tenantId)
      throw new Error("Market worker scope mismatch");
    result.processed++;
    if (job.status === "preparing") {
      try {
        const prep = await prepareMarketConversationJob(db, job, env, now);
        if (prep.information) {
          const answer = await retrieve(prep.information, {
            tenantId: job.tenant_id,
            phone: job.phone,
            language: prep.language ?? "en",
            profile: prep.profile ?? null,
          });
          await finishPreparation(
            db,
            job,
            answer ||
              "The requested information is unavailable. Ask HUMAN for help.",
            clock(),
          );
        }
        result.prepared++;
      } catch {
        // No provider send has happened. Keep the original question private and bounded.
        await finishPreparation(
          db,
          job,
          "This request could not be completed reliably. Ask HUMAN for help, or try a new question later.",
          clock(),
        );
        result.failed++;
      }
      continue;
    }
    const eligibility = await db.transaction(async (tx) => {
      const canonical = (
        await tx.query<{ last_stop_at: Date | string | null }>(
          `SELECT last_stop_at FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
          [job.tenant_id, job.phone],
        )
      ).rows[0];
      if (
        !canonical ||
        (canonical.last_stop_at &&
          new Date(canonical.last_stop_at).getTime() >=
            new Date(job.event_at).getTime())
      )
        return { allowed: false, error: "stopped" };
      const thread = (
        await tx.query<{ paused: boolean; last_event_at: Date | string }>(
          `SELECT paused,last_event_at FROM market_channel_threads WHERE tenant_id=$1 AND phone=$2 FOR UPDATE`,
          [job.tenant_id, job.phone],
        )
      ).rows[0];
      if (!thread || (thread.paused && job.kind !== "handoff"))
        return { allowed: false, error: "automation_paused" };
      if (
        !job.reply_body ||
        now.getTime() - new Date(job.event_at).getTime() >= WINDOW
      )
        return { allowed: false, error: "service_window_expired" };
      const staff = await tx.query(
        `SELECT r.id FROM whatsapp_replies r JOIN whatsapp_inbox i ON i.id=r.inbox_id AND i.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND i.from_number=$2 AND (r.delivery_uncertain=true OR r.status='queued') LIMIT 1`,
        [job.tenant_id, job.phone],
      );
      if (staff.rows.length)
        return { allowed: false, error: "staff_reply_unresolved" };
      return {
        allowed: true,
        lastInboundAt: new Date(thread.last_event_at).toISOString(),
      };
    });
    if (!eligibility.allowed) {
      await finish(db, job, "cancelled", now, eligibility.error);
      continue;
    }
    if (env.AGRIBRIDGE_DEMO === "true") {
      await finish(db, job, "demo", now, "demo_delivery_disabled");
      result.demo++;
      continue;
    }
    const budget = await reserveMessageBudget(
      db,
      job.tenant_id,
      job.phone,
      env,
      now.toISOString().slice(0, 10),
    );
    if (!budget) {
      await finish(db, job, "failed", now, "message_budget_reached");
      result.failed++;
      continue;
    }
    // Re-check STOP/human ownership after reserving a budget, just before provider I/O.
    const finalEligibility = await db.transaction(async (tx) => {
      const canonical = (
        await tx.query<{ last_stop_at: Date | string | null }>(
          `SELECT last_stop_at FROM whatsapp_threads WHERE tenant_id=$1 AND from_number=$2 FOR UPDATE`,
          [job.tenant_id, job.phone],
        )
      ).rows[0];
      if (
        !canonical ||
        (canonical.last_stop_at &&
          new Date(canonical.last_stop_at).getTime() >=
            new Date(job.event_at).getTime())
      )
        return "stopped";
      const latest = (
        await tx.query<{ paused: boolean }>(
          `SELECT paused FROM market_channel_threads WHERE tenant_id=$1 AND phone=$2`,
          [job.tenant_id, job.phone],
        )
      ).rows[0];
      if (!latest || (latest.paused && job.kind !== "handoff"))
        return "automation_paused";
      if (job.tenant_id !== env.CHANNEL_ORGANIZATION_ID?.trim())
        return "channel_scope_changed";
      return null;
    });
    if (finalEligibility) {
      await finish(db, job, "cancelled", clock(), finalEligibility);
      continue;
    }
    const message: OutboundMessage = {
      channel: "whatsapp",
      to: job.phone,
      body: job.reply_body!,
      idempotencyKey: `market:${job.id}`,
      consent: true,
      lastInboundAt: eligibility.lastInboundAt,
    };
    let outcome: OutboundResult;
    try {
      outcome = options.send
        ? await options.send(message)
        : await sendOutbound(message, {
            env,
            fetchImpl: options.fetchImpl,
            now: () => clock().getTime(),
          });
    } catch {
      outcome = {
        status: "failed",
        deliveryUncertain: true,
        error: "provider_outcome_unknown",
        retryable: false,
      };
    }
    const status = outcome.deliveryUncertain
      ? "uncertain"
      : outcome.status === "sent" ||
          outcome.status === "delivered" ||
          outcome.status === "queued"
        ? "sent"
        : "failed";
    await finish(db, job, status, clock(), outcome.error, outcome.providerId);
    if (status === "uncertain") result.uncertain++;
    else if (status === "sent") result.sent++;
    else result.failed++;
  }
  return result;
}
