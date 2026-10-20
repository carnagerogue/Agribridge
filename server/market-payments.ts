import express, { type Express } from "express";
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";
import { ApiError, type AuthRequest } from "./security.js";
import { getMarketNotificationReadiness } from "./market-notifications.js";

const eventSchema = z
  .object({
    eventId: z.string().min(1).max(200),
    provider: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/),
    transactionId: z.string().min(1).max(200),
    tenantId: z.string().min(1).max(160),
    orderId: z.string().min(1).max(160),
    payerId: z.string().min(1).max(160),
    payeeId: z.string().min(1).max(160),
    amountUgx: z.number().int().positive().max(1_000_000_000_000_000),
    currency: z.literal("UGX"),
    status: z.enum(["authorized", "succeeded", "failed", "refunded"]),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type VerifiedMarketPaymentEvent = z.infer<typeof eventSchema>;
export type MarketPaymentAuthentication = {
  verified: true;
  provider: string;
  source: "provider_adapter" | "integrator_gateway";
};
export type MarketPayment = {
  id: string;
  orderId: string;
  provider: string;
  transactionId: string;
  payerId: string;
  payeeId: string;
  amountUgx: number;
  currency: "UGX";
  status: VerifiedMarketPaymentEvent["status"];
  occurredAt: string;
  createdAt: string;
};
type PaymentRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  provider: string;
  transaction_id: string;
  payer_id: string;
  payee_id: string;
  amount_ugx: string | number;
  currency: "UGX";
  status: VerifiedMarketPaymentEvent["status"];
  occurred_at: Date | string;
  created_at: Date | string;
};
const present = (row: PaymentRow): MarketPayment => ({
  id: row.id,
  orderId: row.order_id,
  provider: row.provider,
  transactionId: row.transaction_id,
  payerId: row.payer_id,
  payeeId: row.payee_id,
  amountUgx: Number(row.amount_ugx),
  currency: row.currency,
  status: row.status,
  occurredAt: new Date(row.occurred_at).toISOString(),
  createdAt: new Date(row.created_at).toISOString(),
});
const rank = { authorized: 1, failed: 2, succeeded: 3, refunded: 4 };
function message(event: VerifiedMarketPaymentEvent) {
  const amount = new Intl.NumberFormat("en-UG").format(event.amountUgx);
  const amountLabel = `UGX ${amount}`;
  const reference = event.orderId;
  if (event.status === "authorized")
    return {
      kind: "payment_approved",
      body: `Payment of ${amountLabel} for order ${reference} has been approved by the payment service. Transfer is not yet confirmed. Open Agribridge or contact the team for status.`,
    };
  if (event.status === "succeeded")
    return {
      kind: "payment_confirmed",
      body: `The payment service has confirmed a direct client-to-seller payment of ${amountLabel} for order ${reference}. Check your provider account for availability.`,
    };
  if (event.status === "refunded")
    return {
      kind: "payment_refunded",
      body: `The payment service has confirmed a refund of ${amountLabel} for order ${reference}. Contact Agribridge if you need help.`,
    };
  return {
    kind: "payment_failed",
    body: `The payment service reported that the ${amountLabel} payment for order ${reference} failed. This is not a payment confirmation. Check the order before attempting payment again.`,
  };
}

/**
 * Trusted adapter boundary, not a browser action. An actual provider adapter must
 * verify signatures/transaction lookup and translate its event into this schema.
 * Matching a phone number, a browser return URL or an AI answer is not verification.
 */
export async function recordVerifiedMarketPayment(
  db: Database,
  raw: unknown,
  authentication: MarketPaymentAuthentication,
) {
  const event = eventSchema.parse(raw);
  if (
    authentication?.verified !== true ||
    authentication.provider !== event.provider ||
    !["provider_adapter", "integrator_gateway"].includes(authentication.source)
  )
    throw new ApiError(
      403,
      "PAYMENT_EVENT_UNVERIFIED",
      "Payment events require a verified provider adapter.",
    );
  const occurred = new Date(event.occurredAt);
  if (occurred.getTime() > Date.now() + 300_000)
    throw new ApiError(
      400,
      "PAYMENT_EVENT_FUTURE",
      "The payment event time is invalid.",
    );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(event))
    .digest("hex");
  return db.transaction(async (tx) => {
    // The order lock serializes all payment attempts and order cancellation.
    const {
      rows: [order],
    } = await tx.query<any>(
      `SELECT * FROM market_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
      [event.tenantId, event.orderId],
    );
    if (!order)
      throw new ApiError(404, "NOT_FOUND", "Payment order not found.");
    const {
      rows: [previousEvent],
    } = await tx.query<any>(
      `SELECT event_hash,payment_id FROM market_payment_events WHERE provider=$1 AND event_id=$2`,
      [event.provider, event.eventId],
    );
    if (previousEvent) {
      if (previousEvent.event_hash !== fingerprint)
        throw new ApiError(
          409,
          "PAYMENT_EVENT_CONFLICT",
          "This provider event was already recorded with different details.",
        );
      const {
        rows: [record],
      } = await tx.query<PaymentRow>(
        `SELECT * FROM market_payments WHERE tenant_id=$1 AND id=$2`,
        [event.tenantId, previousEvent.payment_id],
      );
      if (!record)
        throw new ApiError(
          409,
          "PAYMENT_EVENT_CONFLICT",
          "This provider event belongs to another payment scope.",
        );
      return { payment: present(record), duplicate: true, applied: false };
    }
    if (
      Number(order.total_ugx) !== event.amountUgx ||
      order.total_ugx === null ||
      order.buyer_id !== event.payerId ||
      order.seller_id !== event.payeeId
    )
      throw new ApiError(
        409,
        "PAYMENT_ORDER_MISMATCH",
        "The payment amount, payer or seller does not match the confirmed order.",
      );
    if (occurred.getTime() < new Date(order.created_at).getTime() - 300_000)
      throw new ApiError(
        400,
        "PAYMENT_PREDATES_ORDER",
        "The payment event predates the order.",
      );
    const {
      rows: [existing],
    } = await tx.query<PaymentRow>(
      `SELECT * FROM market_payments WHERE provider=$1 AND transaction_id=$2 FOR UPDATE`,
      [event.provider, event.transactionId],
    );
    if (
      existing &&
      (existing.tenant_id !== event.tenantId ||
        existing.order_id !== event.orderId ||
        existing.payer_id !== event.payerId ||
        existing.payee_id !== event.payeeId ||
        Number(existing.amount_ugx) !== event.amountUgx)
    )
      throw new ApiError(
        409,
        "PAYMENT_TRANSACTION_CONFLICT",
        "This provider transaction is already linked to another order or amount.",
      );
    // A refund is a separate transition after a confirmed payment; it is never
    // treated as an ordinary payment approval or cancellation.
    if (
      event.status === "refunded" &&
      existing?.status !== "succeeded" &&
      existing?.status !== "refunded"
    )
      throw new ApiError(
        409,
        "PAYMENT_REFUND_UNCONFIRMED",
        "A refund requires a previously confirmed payment.",
      );
    const applied =
      !existing ||
      (rank[event.status] > rank[existing.status] &&
        occurred.getTime() >= new Date(existing.occurred_at).getTime());
    if (
      applied &&
      !["accepted", "fulfilled"].includes(order.status) &&
      event.status !== "refunded"
    )
      throw new ApiError(
        409,
        "ORDER_NOT_ACCEPTED",
        "The seller must accept this order before payment events are recorded.",
      );
    if (applied && ["authorized", "succeeded"].includes(event.status)) {
      const { rows: otherAttempts } = await tx.query(
        `SELECT id FROM market_payments WHERE tenant_id=$1 AND order_id=$2 AND status IN ('authorized','succeeded') AND NOT (provider=$3 AND transaction_id=$4) LIMIT 1`,
        [event.tenantId, event.orderId, event.provider, event.transactionId],
      );
      if (otherAttempts.length)
        throw new ApiError(
          409,
          "PAYMENT_RECONCILIATION_REQUIRED",
          "Another active payment is recorded for this order. Reconcile it with the provider.",
        );
    }
    let payment = existing;
    if (!existing) {
      const result = await tx.query<PaymentRow>(
        `INSERT INTO market_payments(id,tenant_id,order_id,provider,transaction_id,payer_id,payee_id,amount_ugx,currency,status,occurred_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          randomUUID(),
          event.tenantId,
          event.orderId,
          event.provider,
          event.transactionId,
          event.payerId,
          event.payeeId,
          event.amountUgx,
          event.currency,
          event.status,
          event.occurredAt,
        ],
      );
      payment = result.rows[0];
    } else if (applied) {
      const result = await tx.query<PaymentRow>(
        `UPDATE market_payments SET status=$3,occurred_at=$4,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
        [event.tenantId, existing.id, event.status, event.occurredAt],
      );
      payment = result.rows[0];
    }
    await tx.query(
      `INSERT INTO market_payment_events(provider,event_id,tenant_id,payment_id,event_hash,status,occurred_at,applied) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        event.provider,
        event.eventId,
        event.tenantId,
        payment!.id,
        fingerprint,
        event.status,
        event.occurredAt,
        applied,
      ],
    );
    if (applied) {
      const notification = message(event);
      // A profile phone is self-declared. Do not dispatch to it: a future sender
      // must resolve verified identity, separate permission and an approved template.
      await tx.query(
        `INSERT INTO market_payment_notifications(id,tenant_id,payment_id,recipient_id,event_id,provider,kind,body,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending_configuration')`,
        [
          randomUUID(),
          event.tenantId,
          payment!.id,
          event.payeeId,
          event.eventId,
          event.provider,
          notification.kind,
          notification.body,
        ],
      );
      await tx.query(
        `INSERT INTO audit_events(id,tenant_id,actor_id,actor_name,action,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,'market_payments',$6)`,
        [
          randomUUID(),
          event.tenantId,
          `payment-adapter:${event.provider}`,
          "Verified payment adapter",
          `market.payment_${event.status}`,
          payment!.id,
        ],
      );
    }
    return { payment: present(payment!), duplicate: false, applied };
  });
}

/**
 * Optional integrator gateway protocol. This is NOT a provider integration or a
 * checkout endpoint. It remains disabled unless an operator explicitly configures
 * a trusted translation gateway which verifies the selected payment provider.
 * Signature = HMAC-SHA256(secret, timestamp + '.' + raw JSON), fresh within 5 min.
 */
export function mountMarketPaymentWebhook(
  app: Express,
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
) {
  app.post(
    "/api/marketplace/payments/events",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    (req, res, next) => {
      if (
        env.MARKET_PAYMENT_EVENTS_ENABLED !== "true" ||
        !env.MARKET_PAYMENT_PROVIDER ||
        (env.MARKET_PAYMENT_WEBHOOK_SECRET?.length || 0) < 32
      )
        return res.status(404).json({
          error: {
            code: "PAYMENT_EVENTS_DISABLED",
            message: "A payment-provider integration has not been configured.",
          },
        });
      next();
    },
    express.raw({ type: "application/json", limit: "16kb" }),
    async (req, res) => {
      const timestamp = req.get("x-market-timestamp") || "";
      const signature = req.get("x-market-signature") || "";
      if (
        !/^\d{10}$/.test(timestamp) ||
        Math.abs(Date.now() - Number(timestamp) * 1000) > 300_000 ||
        !/^sha256=[a-f0-9]{64}$/i.test(signature) ||
        !Buffer.isBuffer(req.body)
      )
        throw new ApiError(
          401,
          "PAYMENT_SIGNATURE_INVALID",
          "The payment event signature is invalid or expired.",
        );
      const expected = createHmac("sha256", env.MARKET_PAYMENT_WEBHOOK_SECRET!)
        .update(`${timestamp}.`)
        .update(req.body)
        .digest();
      if (!timingSafeEqual(Buffer.from(signature.slice(7), "hex"), expected))
        throw new ApiError(
          401,
          "PAYMENT_SIGNATURE_INVALID",
          "The payment event signature is invalid or expired.",
        );
      const result = await recordVerifiedMarketPayment(
        db,
        JSON.parse(req.body.toString("utf8")),
        {
          verified: true,
          provider: env.MARKET_PAYMENT_PROVIDER!,
          source: "integrator_gateway",
        },
      );
      res.json({
        received: true,
        duplicate: result.duplicate,
        applied: result.applied,
      });
    },
  );
}

export function mountMarketPayments(
  app: Express,
  db: Database,
  _config?: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
) {
  app.get(
    "/api/marketplace/payments/overview",
    async (req: AuthRequest, res) => {
      const user = req.user!;
      const { limit, offset } = z
        .object({
          limit: z.coerce.number().int().min(1).max(100).default(30),
          offset: z.coerce.number().int().min(0).max(100000).default(0),
        })
        .parse(req.query);
      const { rows: payments } = await db.query<PaymentRow>(
        `SELECT * FROM market_payments WHERE tenant_id=$1 ${user.role === "farmer" ? "AND (payer_id=$2 OR payee_id=$2)" : ""} ORDER BY created_at DESC,id LIMIT $${user.role === "farmer" ? "3" : "2"} OFFSET $${user.role === "farmer" ? "4" : "3"}`,
        user.role === "farmer"
          ? [user.organizationId, user.id, limit + 1, offset]
          : [user.organizationId, limit + 1, offset],
      );
      const { rows: notifications } = await db.query<any>(
        `SELECT id,payment_id,recipient_id,kind,body,status,created_at FROM market_payment_notifications WHERE tenant_id=$1 ${user.role === "farmer" ? "AND recipient_id=$2" : ""} ORDER BY created_at DESC,id LIMIT $${user.role === "farmer" ? "3" : "2"} OFFSET $${user.role === "farmer" ? "4" : "3"}`,
        user.role === "farmer"
          ? [user.organizationId, user.id, limit + 1, offset]
          : [user.organizationId, limit + 1, offset],
      );
      const notificationReadiness = getMarketNotificationReadiness(env);
      res.json({
        payments: payments.slice(0, limit).map(present),
        notifications: notifications.slice(0, limit).map((row) => ({
          id: row.id,
          paymentId: row.payment_id,
          recipientId: row.recipient_id,
          kind: row.kind,
          body: row.body,
          status: row.status,
          createdAt: new Date(row.created_at).toISOString(),
        })),
        pagination: {
          limit,
          offset,
          hasMore: {
            payments: payments.length > limit,
            notifications: notifications.length > limit,
          },
        },
        capabilities: {
          providerConnected: false,
          directToSeller: true,
          automaticWhatsAppEnabled:
            notificationReadiness.enabled && notificationReadiness.configured,
          notificationReadiness,
          reason:
            "Provider onboarding, verified seller destinations and approved notification templates are required before live payments or automatic WhatsApp updates.",
        },
      });
    },
  );
}
