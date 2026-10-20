import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Database, Queryable } from "./db.js";
import { ApiError, type AuthRequest, type User } from "./security.js";
import { audit, mutate } from "./store.js";

export type MarketOrderStatus =
  "requested" | "accepted" | "cancelled" | "fulfilled";
export type MarketOrder = {
  id: string;
  supplyId: string;
  buyerId: string;
  sellerId: string;
  buyerName: string;
  sellerName: string;
  crop: string;
  variety: string;
  grade: string;
  district: string;
  harvestFrom: string;
  harvestUntil: string;
  quantityKg: number;
  priceUgxPerKg: number | null;
  totalUgx: number | null;
  message: string;
  status: MarketOrderStatus;
  version: number;
  sample: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};
type OrderRow = {
  id: string;
  tenant_id: string;
  supply_id: string;
  buyer_id: string;
  seller_id: string;
  buyer_name?: string;
  seller_name?: string;
  crop: string;
  variety: string;
  grade: string;
  district: string;
  harvest_from: Date | string;
  harvest_until: Date | string;
  quantity_kg: number;
  price_ugx_per_kg: number | null;
  total_ugx: string | number | null;
  message: string;
  status: MarketOrderStatus;
  version: number;
  sample: boolean;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};
const createSchema = z
  .object({
    supplyId: z.string().min(1).max(160),
    quantityKg: z.number().int().min(1).max(10_000_000),
    message: z.string().trim().max(600).default(""),
  })
  .strict();
const updateSchema = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(["accepted", "cancelled", "fulfilled"]),
  })
  .strict();
const date = (value: Date | string) => new Date(value).toISOString();
const day = (value: Date | string) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
export function presentMarketOrder(row: OrderRow): MarketOrder {
  return {
    id: row.id,
    supplyId: row.supply_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    buyerName: row.buyer_name || "",
    sellerName: row.seller_name || "",
    crop: row.crop,
    variety: row.variety,
    grade: row.grade,
    district: row.district,
    harvestFrom: day(row.harvest_from),
    harvestUntil: day(row.harvest_until),
    quantityKg: Number(row.quantity_kg),
    priceUgxPerKg: row.price_ugx_per_kg,
    totalUgx: row.total_ugx === null ? null : Number(row.total_ugx),
    message: row.message,
    status: row.status,
    version: row.version,
    sample: row.sample,
    expiresAt: date(row.expires_at),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  };
}
const visible = (row: OrderRow, user: User) =>
  row.tenant_id === user.organizationId &&
  (user.role !== "farmer" ||
    row.buyer_id === user.id ||
    row.seller_id === user.id);
function mutationKey(req: AuthRequest) {
  if (!req.get("idempotency-key"))
    throw new ApiError(
      400,
      "IDEMPOTENCY_REQUIRED",
      "Use a request key when changing an order.",
    );
}
async function reserved(tx: Queryable, tenant: string, supply: string) {
  const result = await tx.query<{ total: string }>(
    `SELECT COALESCE(SUM(quantity_kg),0)::text AS total FROM market_orders WHERE tenant_id=$1 AND supply_id=$2 AND status IN ('accepted','fulfilled')`,
    [tenant, supply],
  );
  return Number(result.rows[0].total);
}

/** Caller must provide an existing transaction; supply lock serializes accept/update. */
export async function createMarketOrder(
  tx: Queryable,
  user: User,
  raw: unknown,
) {
  const input = createSchema.parse(raw);
  const {
    rows: [supply],
  } = await tx.query<any>(
    `SELECT * FROM market_supply WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
    [user.organizationId, input.supplyId],
  );
  if (!supply)
    throw new ApiError(404, "NOT_FOUND", "Produce listing not found.");
  if (supply.owner_id === user.id)
    throw new ApiError(
      400,
      "OWN_SUPPLY",
      "You cannot place an order for your own listing.",
    );
  if (supply.status !== "available")
    throw new ApiError(
      409,
      "SUPPLY_UNAVAILABLE",
      "This produce listing is not accepting requests.",
    );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
  }).format(new Date());
  if (day(supply.harvest_until) < today)
    throw new ApiError(
      409,
      "SUPPLY_EXPIRED",
      "This listing's harvest window has ended. Ask the seller to update availability.",
    );
  const remaining =
    Number(supply.quantity_kg) -
    (await reserved(tx, user.organizationId, supply.id));
  if (input.quantityKg > remaining)
    throw new ApiError(
      409,
      "QUANTITY_UNAVAILABLE",
      "The requested quantity exceeds uncommitted supply.",
    );
  const price = supply.expected_price_ugx_per_kg as number | null;
  const total = price === null ? null : input.quantityKg * price;
  if (
    total !== null &&
    (!Number.isSafeInteger(total) || total > 1_000_000_000_000_000)
  )
    throw new ApiError(
      400,
      "ORDER_VALUE_LIMIT",
      "The order value exceeds the supported limit.",
    );
  const {
    rows: [row],
  } = await tx.query<OrderRow>(
    `INSERT INTO market_orders(id,tenant_id,supply_id,buyer_id,seller_id,quantity_kg,price_ugx_per_kg,total_ugx,crop,variety,grade,district,harvest_from,harvest_until,message,status,sample,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'requested',$16,now()+interval '48 hours') RETURNING *`,
    [
      randomUUID(),
      user.organizationId,
      supply.id,
      user.id,
      supply.owner_id,
      input.quantityKg,
      price,
      total,
      supply.crop,
      supply.variety,
      supply.grade,
      supply.district,
      day(supply.harvest_from),
      day(supply.harvest_until),
      input.message,
      supply.sample,
    ],
  );
  await audit(tx, user, "market.order_requested", "market_orders", row.id);
  return presentMarketOrder(row);
}

export async function transitionMarketOrder(
  tx: Queryable,
  user: User,
  id: string,
  raw: unknown,
) {
  const input = updateSchema.parse(raw);
  // Always lock supply before order, matching create/payment and other order transitions.
  const {
    rows: [peek],
  } = await tx.query<OrderRow>(
    `SELECT * FROM market_orders WHERE tenant_id=$1 AND id=$2`,
    [user.organizationId, id],
  );
  if (!peek || !visible(peek, user))
    throw new ApiError(404, "NOT_FOUND", "Order not found.");
  const {
    rows: [supply],
  } = await tx.query<any>(
    `SELECT * FROM market_supply WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
    [user.organizationId, peek.supply_id],
  );
  const {
    rows: [row],
  } = await tx.query<OrderRow>(
    `SELECT * FROM market_orders WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
    [user.organizationId, id],
  );
  if (row.version !== input.version)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This order changed. Refresh before trying again.",
    );
  const seller = row.seller_id === user.id || user.role !== "farmer";
  if (row.status === "cancelled" || row.status === "fulfilled")
    throw new ApiError(409, "ORDER_FINAL", "This order is already final.");
  if (input.status === "accepted") {
    if (!seller)
      throw new ApiError(
        403,
        "SELLER_REQUIRED",
        "Only the seller or authorized cooperative staff can accept this order.",
      );
    if (row.status !== "requested")
      throw new ApiError(
        409,
        "INVALID_ORDER_TRANSITION",
        "Only a requested order can be accepted.",
      );
    if (new Date(row.expires_at).getTime() <= Date.now())
      throw new ApiError(
        409,
        "ORDER_EXPIRED",
        "This request expired. The client must submit a fresh request.",
      );
    if (supply.status !== "available")
      throw new ApiError(
        409,
        "SUPPLY_UNAVAILABLE",
        "The listing is paused or sold.",
      );
    if (
      row.price_ugx_per_kg === null ||
      supply.expected_price_ugx_per_kg !== row.price_ugx_per_kg
    )
      throw new ApiError(
        409,
        "PRICE_RECONFIRMATION_REQUIRED",
        "A current fixed price must be confirmed in a new client request before acceptance.",
      );
    if (
      row.crop !== supply.crop ||
      row.variety !== supply.variety ||
      row.grade !== supply.grade ||
      row.district !== supply.district ||
      day(row.harvest_from) !== day(supply.harvest_from) ||
      day(row.harvest_until) !== day(supply.harvest_until)
    )
      throw new ApiError(
        409,
        "TERMS_CHANGED",
        "Listing terms changed. The client must review a new request.",
      );
    if (
      Number(row.quantity_kg) +
        (await reserved(tx, user.organizationId, row.supply_id)) >
      Number(supply.quantity_kg)
    )
      throw new ApiError(
        409,
        "QUANTITY_UNAVAILABLE",
        "Another accepted order committed this quantity. Ask the client to revise it.",
      );
  } else if (input.status === "fulfilled") {
    if (!seller)
      throw new ApiError(
        403,
        "SELLER_REQUIRED",
        "Only the seller or authorized cooperative staff can record fulfillment.",
      );
    if (row.status !== "accepted")
      throw new ApiError(
        409,
        "INVALID_ORDER_TRANSITION",
        "Accept the order before recording fulfillment.",
      );
  } else {
    if (row.status === "accepted" && !seller)
      throw new ApiError(
        403,
        "SELLER_REQUIRED",
        "Ask the seller to cancel an accepted order.",
      );
    const { rows: payments } = await tx.query(
      `SELECT id FROM market_payments WHERE tenant_id=$1 AND order_id=$2 AND status IN ('authorized','succeeded') LIMIT 1`,
      [user.organizationId, id],
    );
    if (payments.length)
      throw new ApiError(
        409,
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Resolve or refund the recorded payment before cancelling this order.",
      );
  }
  const {
    rows: [updated],
  } = await tx.query<OrderRow>(
    `UPDATE market_orders SET status=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    [user.organizationId, id, input.status],
  );
  await audit(tx, user, `market.order_${input.status}`, "market_orders", id);
  return presentMarketOrder(updated);
}

export function mountMarketOrders(
  app: Express,
  db: Database,
  _config?: AppConfig,
) {
  app.get("/api/marketplace/orders", async (req: AuthRequest, res) => {
    const user = req.user!;
    const { limit, offset } = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(req.query);
    const { rows } = await db.query<OrderRow>(
      `SELECT o.*,b.name AS buyer_name,p.business_name AS seller_name FROM market_orders o
       JOIN users b ON b.tenant_id=o.tenant_id AND b.id=o.buyer_id
       JOIN market_profiles p ON p.tenant_id=o.tenant_id AND p.owner_id=o.seller_id
       WHERE o.tenant_id=$1 ${user.role === "farmer" ? "AND (o.buyer_id=$2 OR o.seller_id=$2)" : ""}
       ORDER BY o.created_at DESC,o.id LIMIT $${user.role === "farmer" ? "3" : "2"} OFFSET $${user.role === "farmer" ? "4" : "3"}`,
      user.role === "farmer"
        ? [user.organizationId, user.id, limit + 1, offset]
        : [user.organizationId, limit + 1, offset],
    );
    res.json({
      orders: rows.slice(0, limit).map(presentMarketOrder),
      pagination: { limit, offset, hasMore: rows.length > limit },
      capabilities: {
        checkoutEnabled: false,
        reason:
          "A direct-to-seller payment provider has not been connected. These are recorded order requests, not completed purchases.",
      },
    });
  });
  app.post("/api/marketplace/orders", async (req: AuthRequest, res) => {
    mutationKey(req);
    const result = await mutate(db, req, async (tx) => ({
      status: 201,
      body: await createMarketOrder(tx, req.user!, req.body),
    }));
    res.status(result.status).json(result.body);
  });
  app.patch("/api/marketplace/orders/:id", async (req: AuthRequest, res) => {
    mutationKey(req);
    const id = z.string().max(160).parse(req.params.id);
    const result = await mutate(db, req, async (tx) => ({
      status: 200,
      body: await transitionMarketOrder(tx, req.user!, id, req.body),
    }));
    res.status(result.status).json(result.body);
  });
}
