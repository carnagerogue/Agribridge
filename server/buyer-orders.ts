import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database, Queryable } from "./db.js";
import { ApiError, type AuthRequest, type User } from "./security.js";
import { audit, mutate } from "./store.js";
import { committedMarketQuantity, marketToday } from "./marketplace.js";
import type {
  BuyerOrder,
  BuyerOrdersResponse,
  BuyerOrderStatus,
} from "./buyer-order-types.js";

type BuyerPrincipal = { id: string; name: string; businessName: string };
type OrderRow = {
  id: string;
  seller_tenant_id: string;
  supply_id: string;
  seller_id: string;
  buyer_id: string;
  seller_name: string;
  buyer_name: string;
  buyer_business_name: string;
  crop: string;
  variety: string;
  grade: string;
  district: string;
  community: string;
  harvest_from: string | Date;
  harvest_until: string | Date;
  quantity_kg: number;
  price_ugx_per_kg: number;
  total_ugx: string | number;
  delivery_location: string;
  requested_delivery_date: string | Date | null;
  message: string;
  status: BuyerOrderStatus;
  version: number;
  source_version: number;
  sample: boolean;
  expires_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
};
const day = (value: string | Date) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
const iso = (value: string | Date) => new Date(value).toISOString();
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Choose a real calendar date.");
const createSchema = z
  .object({
    supplyId: z.string().min(1).max(160),
    listingVersion: z.number().int().positive(),
    quantityKg: z.number().int().min(1).max(10_000_000),
    deliveryLocation: z.string().trim().min(2).max(240),
    requestedDeliveryDate: calendarDate.nullable().default(null),
    message: z.string().trim().max(600).default(""),
  })
  .strict();
const sellerTransitionSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(["accepted", "cancelled", "fulfilled"]),
  })
  .strict();
const buyerCancelSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.literal("cancelled"),
  })
  .strict();
const pagination = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(100_000).default(0),
  })
  .strict();
const capabilities: BuyerOrdersResponse["capabilities"] = {
  checkoutEnabled: false,
  totalIncludesTransport: false,
  reason:
    "These are produce order requests. A direct-to-seller payment provider is not connected; transport costs and final handover terms need agreement. No payment is taken here.",
};

export function presentBuyerOrder(row: OrderRow): BuyerOrder {
  // No private seller/buyer account IDs, phone numbers, email addresses or
  // organization tenant keys cross this publication/transaction boundary.
  return {
    id: row.id,
    supplyId: row.supply_id,
    sellerName: row.seller_name,
    buyerName: row.buyer_name,
    buyerBusinessName: row.buyer_business_name,
    crop: row.crop,
    variety: row.variety,
    grade: row.grade,
    district: row.district,
    community: row.community,
    harvestFrom: day(row.harvest_from),
    harvestUntil: day(row.harvest_until),
    quantityKg: Number(row.quantity_kg),
    priceUgxPerKg: Number(row.price_ugx_per_kg),
    totalUgx: Number(row.total_ugx),
    deliveryLocation: row.delivery_location,
    requestedDeliveryDate:
      row.requested_delivery_date === null
        ? null
        : day(row.requested_delivery_date),
    message: row.message,
    status: row.status,
    version: row.version,
    sourceVersion: row.source_version,
    sample: row.sample,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function listBuyerOrders(
  db: Queryable,
  buyerId: string,
  query: unknown = {},
): Promise<BuyerOrdersResponse> {
  const { limit, offset } = pagination.parse(query);
  const { rows } = await db.query<OrderRow>(
    `SELECT * FROM buyer_orders WHERE buyer_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3`,
    [buyerId, limit + 1, offset],
  );
  return {
    orders: rows.slice(0, limit).map(presentBuyerOrder),
    pagination: { limit, offset, hasMore: rows.length > limit },
    capabilities,
  };
}

/** Called by the isolated buyer mutation wrapper inside its idempotency transaction. */
export async function createBuyerOrder(
  tx: Queryable,
  buyer: BuyerPrincipal,
  raw: unknown,
  options: { includeSample?: boolean } = {},
): Promise<BuyerOrder> {
  const input = createSchema.parse(raw);
  const {
    rows: [supply],
  } = await tx.query<any>(
    `SELECT s.*,p.business_name AS seller_name,p.sample AS profile_sample,u.active AS seller_active
     FROM market_supply s JOIN market_profiles p ON p.tenant_id=s.tenant_id AND p.id=s.profile_id AND p.owner_id=s.owner_id
     JOIN users u ON u.tenant_id=s.tenant_id AND u.id=s.owner_id
     WHERE s.id=$1 FOR UPDATE OF s`,
    [input.supplyId],
  );
  if (
    !supply ||
    !supply.published ||
    !supply.seller_active ||
    ((supply.sample || supply.profile_sample) && !options.includeSample)
  )
    throw new ApiError(
      404,
      "NOT_FOUND",
      "This produce listing is not available to clients.",
    );
  if (supply.version !== input.listingVersion)
    throw new ApiError(
      409,
      "LISTING_CHANGED",
      "This listing changed. Review its latest quantity, price and terms before requesting an order.",
    );
  if (
    supply.status !== "available" ||
    day(supply.harvest_until) < marketToday()
  )
    throw new ApiError(
      409,
      "SUPPLY_UNAVAILABLE",
      "This produce listing is paused, sold or outside its availability window.",
    );
  if (supply.expected_price_ugx_per_kg === null)
    throw new ApiError(
      409,
      "QUOTE_REQUIRED",
      "The seller must publish a fixed price before a client order can be requested.",
    );
  if (
    input.requestedDeliveryDate &&
    (input.requestedDeliveryDate < marketToday() ||
      input.requestedDeliveryDate < day(supply.harvest_from))
  )
    throw new ApiError(
      400,
      "DELIVERY_DATE_INVALID",
      "Choose a requested handover date on or after today and the harvest start. The seller must confirm it.",
    );
  const committed = await committedMarketQuantity(
    tx,
    supply.tenant_id,
    supply.id,
  );
  if (input.quantityKg > Number(supply.quantity_kg) - committed)
    throw new ApiError(
      409,
      "QUANTITY_UNAVAILABLE",
      "The requested quantity exceeds the seller's remaining uncommitted supply.",
    );
  const total = input.quantityKg * Number(supply.expected_price_ugx_per_kg);
  if (!Number.isSafeInteger(total) || total > 1_000_000_000_000_000)
    throw new ApiError(
      400,
      "ORDER_VALUE_LIMIT",
      "The produce value exceeds the supported order limit.",
    );
  const {
    rows: [order],
  } = await tx.query<OrderRow>(
    `INSERT INTO buyer_orders(id,seller_tenant_id,supply_id,seller_id,buyer_id,quantity_kg,price_ugx_per_kg,total_ugx,crop,variety,grade,district,community,seller_name,buyer_name,buyer_business_name,harvest_from,harvest_until,delivery_location,requested_delivery_date,message,status,source_version,sample,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'requested',$22,$23,now()+interval '48 hours') RETURNING *`,
    [
      randomUUID(),
      supply.tenant_id,
      supply.id,
      supply.owner_id,
      buyer.id,
      input.quantityKg,
      supply.expected_price_ugx_per_kg,
      total,
      supply.crop,
      supply.variety,
      supply.grade,
      supply.district,
      supply.community,
      supply.seller_name,
      buyer.name,
      buyer.businessName,
      day(supply.harvest_from),
      day(supply.harvest_until),
      input.deliveryLocation,
      input.requestedDeliveryDate,
      input.message,
      supply.version,
      supply.sample,
    ],
  );
  await buyerAudit(
    tx,
    order,
    buyer.id,
    buyer.name,
    "market.buyer_order_requested",
  );
  return presentBuyerOrder(order);
}

async function buyerAudit(
  tx: Queryable,
  order: OrderRow,
  actorId: string,
  actorName: string,
  action: string,
) {
  await tx.query(
    `INSERT INTO audit_events(id,tenant_id,actor_id,actor_name,action,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,'buyer_orders',$6)`,
    [
      randomUUID(),
      order.seller_tenant_id,
      `buyer:${actorId}`,
      actorName,
      action,
      order.id,
    ],
  );
}

async function lockedOrder(
  tx: Queryable,
  id: string,
  scope: { buyerId: string } | { user: User },
) {
  const values =
    "buyerId" in scope
      ? [id, scope.buyerId]
      : [
          id,
          scope.user.organizationId,
          ...(scope.user.role === "farmer" ? [scope.user.id] : []),
        ];
  const filter =
    "buyerId" in scope
      ? "buyer_id=$2"
      : `seller_tenant_id=$2${scope.user.role === "farmer" ? " AND seller_id=$3" : ""}`;
  const {
    rows: [peek],
  } = await tx.query<OrderRow>(
    `SELECT * FROM buyer_orders WHERE id=$1 AND ${filter}`,
    values,
  );
  if (!peek) throw new ApiError(404, "NOT_FOUND", "Order request not found.");
  // All systems acquire the same supply lock before the order row lock.
  const {
    rows: [supply],
  } = await tx.query<any>(
    `SELECT * FROM market_supply WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
    [peek.seller_tenant_id, peek.supply_id],
  );
  const {
    rows: [order],
  } = await tx.query<OrderRow>(
    `SELECT * FROM buyer_orders WHERE id=$1 AND ${filter} FOR UPDATE`,
    values,
  );
  if (!order || !supply)
    throw new ApiError(404, "NOT_FOUND", "Order request not found.");
  return { order, supply };
}
function version(order: OrderRow, expected: number) {
  if (order.version !== expected)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This order changed. Refresh it before trying again.",
    );
}
async function updateOrder(
  tx: Queryable,
  order: OrderRow,
  status: BuyerOrderStatus,
) {
  return (
    await tx.query<OrderRow>(
      `UPDATE buyer_orders SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
      [order.id, status],
    )
  ).rows[0];
}

/** Only the requesting buyer may cancel, and only before seller acceptance. */
export async function cancelBuyerOrder(
  tx: Queryable,
  buyer: BuyerPrincipal,
  id: string,
  raw: unknown,
): Promise<BuyerOrder> {
  const input = buyerCancelSchema.parse(raw);
  const { order } = await lockedOrder(tx, id, { buyerId: buyer.id });
  version(order, input.version);
  if (order.status !== "requested")
    throw new ApiError(
      409,
      "SELLER_CANCELLATION_REQUIRED",
      "Ask the seller to resolve an accepted order. Final orders cannot be changed.",
    );
  const updated = await updateOrder(tx, order, "cancelled");
  await buyerAudit(
    tx,
    order,
    buyer.id,
    buyer.name,
    "market.buyer_order_cancelled",
  );
  return presentBuyerOrder(updated);
}

export async function transitionSellerBuyerOrder(
  tx: Queryable,
  user: User,
  id: string,
  raw: unknown,
): Promise<BuyerOrder> {
  const input = sellerTransitionSchema.parse(raw);
  const { order, supply } = await lockedOrder(tx, id, { user });
  version(order, input.version);
  if (["cancelled", "fulfilled"].includes(order.status))
    throw new ApiError(409, "ORDER_FINAL", "This order is already final.");
  if (input.status === "accepted") {
    if (order.status !== "requested")
      throw new ApiError(
        409,
        "INVALID_ORDER_TRANSITION",
        "Only a requested order can be accepted.",
      );
    if (new Date(order.expires_at).getTime() <= Date.now())
      throw new ApiError(
        409,
        "ORDER_EXPIRED",
        "This client request expired. A new request is needed.",
      );
    // Publication governs new requests; unpublishing does not invalidate a
    // previously agreed request or release an accepted commitment.
    if (
      supply.status !== "available" ||
      day(supply.harvest_until) < marketToday()
    )
      throw new ApiError(
        409,
        "SUPPLY_UNAVAILABLE",
        "The listing is paused, sold or outside its availability window.",
      );
    if (
      Number(supply.expected_price_ugx_per_kg) !==
        Number(order.price_ugx_per_kg) ||
      supply.expected_price_ugx_per_kg === null ||
      supply.crop !== order.crop ||
      supply.variety !== order.variety ||
      supply.grade !== order.grade ||
      supply.district !== order.district ||
      supply.community !== order.community ||
      day(supply.harvest_from) !== day(order.harvest_from) ||
      day(supply.harvest_until) !== day(order.harvest_until)
    )
      throw new ApiError(
        409,
        "TERMS_CHANGED",
        "Listing terms changed. Ask the client to review a new order request.",
      );
    const committed = await committedMarketQuantity(
      tx,
      order.seller_tenant_id,
      order.supply_id,
    );
    if (Number(order.quantity_kg) > Number(supply.quantity_kg) - committed)
      throw new ApiError(
        409,
        "QUANTITY_UNAVAILABLE",
        "Another accepted order committed this stock. Ask the client to revise the request.",
      );
  } else if (input.status === "fulfilled" && order.status !== "accepted") {
    throw new ApiError(
      409,
      "INVALID_ORDER_TRANSITION",
      "Accept the order before recording handover.",
    );
  }
  const updated = await updateOrder(tx, order, input.status);
  await audit(
    tx,
    user,
    `market.buyer_order_${input.status}`,
    "buyer_orders",
    order.id,
  );
  return presentBuyerOrder(updated);
}

function mutationKey(req: AuthRequest) {
  if (!req.get("idempotency-key"))
    throw new ApiError(
      400,
      "IDEMPOTENCY_REQUIRED",
      "Use a request key for this market action.",
    );
}

/** Existing application sessions, never the isolated client cookie, authorize these routes. */
export function mountMarketBuyerOrders(app: Express, db: Database) {
  app.get("/api/marketplace/buyer-orders", async (req: AuthRequest, res) => {
    const user = req.user!,
      { limit, offset } = pagination.parse(req.query);
    const own = user.role === "farmer";
    const { rows } = await db.query<OrderRow>(
      `SELECT * FROM buyer_orders WHERE seller_tenant_id=$1 ${own ? "AND seller_id=$2" : ""} ORDER BY created_at DESC,id LIMIT $${own ? 3 : 2} OFFSET $${own ? 4 : 3}`,
      own
        ? [user.organizationId, user.id, limit + 1, offset]
        : [user.organizationId, limit + 1, offset],
    );
    res.json({
      orders: rows.slice(0, limit).map(presentBuyerOrder),
      pagination: { limit, offset, hasMore: rows.length > limit },
      capabilities,
    } satisfies BuyerOrdersResponse);
  });
  app.patch(
    "/api/marketplace/buyer-orders/:id",
    async (req: AuthRequest, res) => {
      mutationKey(req);
      const id = z.string().min(1).max(160).parse(req.params.id);
      const result = await mutate(db, req, async (tx) => ({
        status: 200,
        body: await transitionSellerBuyerOrder(tx, req.user!, id, req.body),
      }));
      res.status(result.status).json(result.body);
    },
  );
  app.post(
    "/api/marketplace/supply/:id/publication",
    async (req: AuthRequest, res) => {
      mutationKey(req);
      const id = z.string().min(1).max(160).parse(req.params.id);
      const input = z
        .object({
          version: z.number().int().positive(),
          published: z.boolean(),
        })
        .strict()
        .parse(req.body);
      const user = req.user!;
      const result = await mutate(db, req, async (tx) => {
        const {
          rows: [supply],
        } = await tx.query<any>(
          `SELECT * FROM market_supply WHERE tenant_id=$1 AND id=$2 ${user.role === "farmer" ? "AND owner_id=$3" : ""} FOR UPDATE`,
          user.role === "farmer"
            ? [user.organizationId, id, user.id]
            : [user.organizationId, id],
        );
        if (!supply)
          throw new ApiError(404, "NOT_FOUND", "Produce listing not found.");
        if (supply.version !== input.version)
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "This listing changed. Refresh before changing publication.",
          );
        if (input.published) {
          if (
            supply.status !== "available" ||
            day(supply.harvest_until) < marketToday() ||
            Number(supply.quantity_kg) <=
              (await committedMarketQuantity(tx, user.organizationId, id))
          )
            throw new ApiError(
              409,
              "SUPPLY_UNAVAILABLE",
              "Only available, unexpired produce with remaining stock can be published.",
            );
          const { rows: active } = await tx.query(
            `SELECT id FROM users WHERE tenant_id=$1 AND id=$2 AND active=true`,
            [user.organizationId, supply.owner_id],
          );
          if (!active.length)
            throw new ApiError(
              409,
              "SELLER_INACTIVE",
              "The seller account must be active before publication.",
            );
        }
        const {
          rows: [updated],
        } = await tx.query<{ id: string; version: number; published: boolean }>(
          `UPDATE market_supply SET published=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING id,version,published`,
          [user.organizationId, id, input.published],
        );
        await audit(
          tx,
          user,
          input.published
            ? "market.supply_published"
            : "market.supply_unpublished",
          "market_supply",
          id,
        );
        return { status: 200, body: updated };
      });
      res.status(result.status).json(result.body);
    },
  );
}
