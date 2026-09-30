import { randomUUID } from "node:crypto";
import type { Database, Queryable } from "./db.js";
import { getLessons } from "./lesson-editorial.js";
import {
  getUssdDecision,
  resolveUssd,
  type ChannelHandlers,
} from "./channels/index.js";
import { ApiError, type User } from "./security.js";
import { audit, insertEntity, type EntityRow } from "./store.js";
import { createWeatherService } from "./weather.js";
import {
  persistWhatsAppInbound,
  applyWhatsAppDelivery,
  stopWhatsAppSupport,
} from "./whatsapp.js";

export function createChannelBridge(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): ChannelHandlers {
  const weather = createWeatherService(env, fetchImpl);
  const scope = () => {
    const id = env.CHANNEL_ORGANIZATION_ID;
    if (!id)
      throw new ApiError(
        503,
        "CHANNEL_SCOPE_MISSING",
        "Channel organization is not configured.",
      );
    return id;
  };
  const actor = (tenantId: string): User => ({
    id: "channel-system",
    name: "Verified channel callback",
    role: "operator",
    organizationId: tenantId,
    organizationName: "",
  });
  async function once<T>(
    provider: string,
    eventId: string,
    work: (tx: Queryable) => Promise<T>,
  ): Promise<T | undefined> {
    return db.transaction(async (tx) => {
      const { rows } = await tx.query<{ response: string }>(
        `INSERT INTO channel_events(provider,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING response`,
        [provider, eventId],
      );
      if (!rows.length) {
        const old = await tx.query<{ response: string }>(
          `SELECT response FROM channel_events WHERE provider=$1 AND event_id=$2`,
          [provider, eventId],
        );
        return old.rows[0]?.response as T | undefined;
      }
      const result = await work(tx);
      if (typeof result === "string")
        await tx.query(
          `UPDATE channel_events SET response=$3 WHERE provider=$1 AND event_id=$2`,
          [provider, eventId, result],
        );
      return result;
    });
  }
  async function contact(tx: Queryable, tenant: string, phone: string) {
    const { rows } = await tx.query<EntityRow>(
      `SELECT * FROM entities WHERE tenant_id=$1 AND type='contacts' AND data->>'phone'=$2 ORDER BY created_at LIMIT 1 FOR UPDATE`,
      [tenant, phone],
    );
    return rows[0];
  }
  async function optOut(
    tx: Queryable,
    tenant: string,
    phone: string,
    occurredAt = new Date().toISOString(),
  ) {
    await stopWhatsAppSupport(tx, tenant, phone, occurredAt);
    await tx.query(
      `UPDATE entities SET data=data || $3::jsonb,version=version+1,updated_at=now() WHERE tenant_id=$1 AND type='contacts' AND data->>'phone'=$2 AND COALESCE((data->>'consentRecordedAt')::timestamptz,'epoch')<=$4::timestamptz AND COALESCE((data->>'consentWithdrawnAt')::timestamptz,'epoch')<=$4::timestamptz`,
      [
        tenant,
        phone,
        JSON.stringify({
          consent: false,
          consentChannels: [],
          consentWithdrawnAt: occurredAt,
        }),
        occurredAt,
      ],
    );
    await audit(tx, actor(tenant), "consent.withdrawn", "contacts");
    return true;
  }
  async function supportTask(
    tx: Queryable,
    tenant: string,
    phone: string,
    command: string,
    channel: string,
    eventId: string,
  ) {
    const { rows } = await tx.query<any>(
      `SELECT id,name FROM users WHERE tenant_id=$1 AND role IN ('operator','admin') AND active=true ORDER BY role LIMIT 1`,
      [tenant],
    );
    if (!rows[0]) return;
    const owner = { ...actor(tenant), id: rows[0].id, name: rows[0].name };
    await insertEntity(tx, owner, "tasks", {
      farmId: "",
      title:
        command === "start"
          ? "Confirm messaging permission with caller"
          : "Review an incoming support request",
      dueDate: new Date().toISOString().slice(0, 10),
      category: "follow_up",
      status: "pending",
      notes:
        channel === "whatsapp"
          ? "Open the private WhatsApp support inbox to review this request. Message content and sender details are not copied into tasks. START does not enrol anyone in marketing alerts."
          : `${channel.toUpperCase()} request from ${phone}. Command: ${command}. Provider reference: ${eventId.slice(0, 120)}. Message text is not retained here; review through the authorized provider inbox. START alone does not enrol the caller in alerts.`,
    });
  }
  return {
    async handleInbound(event) {
      const tenant = scope();
      await once(`${tenant}:${event.provider}`, event.eventId, async (tx) => {
        if (event.channel === "whatsapp")
          await persistWhatsAppInbound(tx, tenant, event);
        if (event.command === "stop") {
          await optOut(tx, tenant, event.from, event.occurredAt);
          return;
        }
        const row = await contact(tx, tenant, event.from);
        if (row) {
          const previous = row.data.lastInboundAt?.[event.channel];
          const latest =
            previous && Date.parse(previous) > Date.parse(event.occurredAt)
              ? previous
              : event.occurredAt;
          await tx.query(
            `UPDATE entities SET data=data || $2::jsonb,version=version+1,updated_at=now() WHERE id=$1`,
            [
              row.id,
              JSON.stringify({
                lastInboundAt: {
                  ...row.data.lastInboundAt,
                  [event.channel]: latest,
                },
              }),
            ],
          );
        }
        await supportTask(
          tx,
          tenant,
          event.from,
          event.command,
          event.channel,
          event.eventId,
        );
        await audit(
          tx,
          actor(tenant),
          event.command === "start" ? "consent.requested" : "message.received",
          "contacts",
          row?.id,
        );
      });
    },
    async handleDelivery(event) {
      const tenant = scope();
      await once(`${tenant}:${event.provider}`, event.eventId, async (tx) => {
        await tx.query(
          `INSERT INTO channel_deliveries(tenant_id,provider_id,status,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,provider_id) DO UPDATE SET status=CASE WHEN channel_deliveries.status='delivered' OR (channel_deliveries.status='failed' AND EXCLUDED.status IN ('queued','sent')) OR (channel_deliveries.status='sent' AND EXCLUDED.status='queued') THEN channel_deliveries.status ELSE EXCLUDED.status END,occurred_at=GREATEST(channel_deliveries.occurred_at,EXCLUDED.occurred_at)`,
          [tenant, event.providerId, event.status, event.occurredAt],
        );
        await applyWhatsAppDelivery(tx, tenant, event);
        const { rows } = await tx.query<EntityRow>(
          `SELECT * FROM entities WHERE tenant_id=$1 AND type='messages' AND data->>'providerId'=$2 FOR UPDATE`,
          [tenant, event.providerId],
        );
        for (const row of rows) {
          const old = row.data.status;
          const rank: Record<string, number> = {
            queued: 0,
            sent: 1,
            failed: 2,
            delivered: 3,
          };
          if ((rank[event.status] ?? 0) <= (rank[old] ?? -1)) continue;
          await tx.query(
            `UPDATE entities SET data=data || $2::jsonb,version=version+1,updated_at=now() WHERE id=$1`,
            [
              row.id,
              JSON.stringify({
                status: event.status,
                deliveryUpdatedAt: event.occurredAt,
              }),
            ],
          );
          await audit(
            tx,
            actor(tenant),
            `message.${event.status}`,
            "messages",
            row.id,
          );
        }
      });
    },
    async handleUssd(request) {
      const tenant = scope();
      const provider = `${tenant}:ussd`;
      const previous = await db.query<{ response: string }>(
        `SELECT response FROM channel_events WHERE provider=$1 AND event_id=$2`,
        [provider, request.eventId],
      );
      if (previous.rows[0]?.response) return previous.rows[0].response;
      // Public provider I/O must not occupy a database transaction or hold row locks.
      // The transaction below still atomically deduplicates the response and effects.
      const decision = getUssdDecision(request.text);
      let forecastText: string | undefined;
      if ("action" in decision && decision.action === "weather") {
        const points: Record<string, [number, number]> = {
          Kampala: [0.3136, 32.5811],
          Wakiso: [0.4044, 32.4594],
          Jinja: [0.4479, 33.2026],
          Mbale: [1.0821, 34.175],
          Gulu: [2.7724, 32.2881],
          Mbarara: [-0.6072, 30.6545],
        };
        const point = points[decision.value];
        if (point)
          try {
            const forecast = await weather(...point);
            const day = forecast.days[0];
            forecastText = `${decision.value}, ${day.date}: ${day.min}-${day.max}C; rain chance ${day.rainChance}%. Open-Meteo model${forecast.stale ? ", OLD FORECAST" : ""}. Check local conditions.`;
          } catch {
            /* A provider outage becomes an honest unavailable response. */
          }
      }
      const value = await once(provider, request.eventId, async (tx) =>
        resolveUssd(request.text, {
          weather: async () => forecastText,
          market: async (district) => {
            const { rows } = await tx.query<EntityRow>(
              `SELECT * FROM entities WHERE tenant_id=$1 AND type='market-prices' AND data->>'district'=$2 AND data->>'status'='verified' AND (data->>'observedAt')::timestamptz > now()-interval '7 days' ORDER BY updated_at DESC LIMIT 1`,
              [tenant, district],
            );
            const row = rows[0];
            return row
              ? `${row.data.crop}: UGX ${row.data.priceUgx}/kg, ${row.data.market}, ${String(row.data.observedAt).slice(0, 10)}. Source: ${row.data.source}.`
              : undefined;
          },
          lesson: async (crop) => {
            const guide = (await getLessons(tx, tenant)).find(
              (item) => item.crop === crop && item.reviewStatus === "reviewed",
            );
            return guide ? guide.summary : undefined;
          },
          optOut: () => optOut(tx, tenant, request.from),
          requestCallback: async () => {
            const { rows } = await tx.query<any>(
              `SELECT id,name FROM users WHERE tenant_id=$1 AND role IN ('operator','admin') AND active=true ORDER BY role LIMIT 1`,
              [tenant],
            );
            if (!rows[0]) return false;
            const owner: User = {
              ...actor(tenant),
              id: rows[0].id,
              name: rows[0].name,
            };
            await insertEntity(tx, owner, "tasks", {
              farmId: "",
              title: "Return a requested support call",
              dueDate: new Date().toISOString().slice(0, 10),
              category: "follow_up",
              status: "pending",
              notes: `Caller ${request.from} consented to one support callback via USSD. Do not enrol in ongoing alerts.`,
              callbackRequestId: randomUUID(),
            });
            await audit(tx, actor(tenant), "callback.requested", "tasks");
            return true;
          },
        }),
      );
      return value || "END Service unavailable. Please try again.";
    },
  };
}
