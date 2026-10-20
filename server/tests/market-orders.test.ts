import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import type { Server } from "node:http";
import { openDatabase, migrate, type Database } from "../db.js";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { seedDemo, DEMO_TENANT, DEMO_USERS } from "../seed.js";
import { hashPassword } from "../security.js";
import {
  recordVerifiedMarketPayment,
  type VerifiedMarketPaymentEvent,
} from "../market-payments.js";

let db: Database, server: Server, url: string;
type Client = { cookie: string; csrf: string };
let seller: Client, buyer: Client, other: Client;
const buyerId = "market-order-buyer";
const otherId = "market-order-other";
const secret = "test-only-market-gateway-secret-not-a-real-credential";
const env = {
  MARKET_PAYMENT_EVENTS_ENABLED: "true",
  MARKET_PAYMENT_PROVIDER: "fixture-gateway",
  MARKET_PAYMENT_WEBHOOK_SECRET: secret,
};
const tomorrow = (offset = 1) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function call(
  path: string,
  client?: Client,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const response = await fetch(url + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(client ? { cookie: client.cookie, "x-csrf-token": client.csrf } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: (await response.json()) as any,
    response,
  };
}
async function login(email: string) {
  const result = await call("/api/auth/login", undefined, "POST", {
    email,
    password: "Only-for-market-order-tests-123",
  });
  assert.equal(result.status, 200);
  return {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrfToken,
  };
}
async function supply(quantity = 100, price: number | null = 1000) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO market_supply(id,tenant_id,owner_id,profile_id,crop,variety,quantity_kg,expected_price_ugx_per_kg,harvest_from,harvest_until,district,community,grade,status,sample) VALUES($1,$2,$3,$4,'Maize','White',$5,$6,$7,$8,'Nakaseke','Test community','Grade 2','available',true)`,
    [
      id,
      DEMO_TENANT,
      DEMO_USERS.farmer,
      profileId,
      quantity,
      price,
      tomorrow(-1),
      tomorrow(30),
    ],
  );
  return id;
}
async function requestOrder(supplyId: string, quantityKg = 50) {
  const result = await call(
    "/api/marketplace/orders",
    buyer,
    "POST",
    { supplyId, quantityKg, message: "Fixture request" },
    randomUUID(),
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
async function accept(order: any) {
  const result = await call(
    `/api/marketplace/orders/${order.id}`,
    seller,
    "PATCH",
    { version: order.version, status: "accepted" },
    randomUUID(),
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}
const verified = {
  verified: true as const,
  provider: "fixture-gateway",
  source: "provider_adapter" as const,
};
const paymentEvent = (
  order: any,
  overrides: Partial<VerifiedMarketPaymentEvent> = {},
): VerifiedMarketPaymentEvent => ({
  eventId: randomUUID(),
  provider: "fixture-gateway",
  transactionId: randomUUID(),
  tenantId: DEMO_TENANT,
  orderId: order.id,
  payerId: buyerId,
  payeeId: DEMO_USERS.farmer,
  amountUgx: order.totalUgx,
  currency: "UGX",
  status: "authorized",
  occurredAt: new Date().toISOString(),
  ...overrides,
});
before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await seedDemo(db);
  await db.query(
    `INSERT INTO organizations(id,name) VALUES('order-other-org','Other organization')`,
  );
  const password = await hashPassword("Only-for-market-order-tests-123");
  await db.query(
    `INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES($1,$2,'Order buyer','order-buyer@example.test',$3,'farmer'),($4,'order-other-org','Other farmer','order-other@example.test',$3,'farmer')`,
    [buyerId, DEMO_TENANT, password, otherId],
  );
  await db.query(
    `INSERT INTO market_profiles(id,tenant_id,owner_id,name,business_name,phone,district,community,crops,language) VALUES('order-test-profile',$1,$2,'Grace','Order test farm','+256700000001','Nakaseke','Test community',ARRAY['Maize'],'en') ON CONFLICT(tenant_id,owner_id) DO NOTHING`,
    [DEMO_TENANT, DEMO_USERS.farmer],
  );
  // seedMarketplace may already have created this seller's profile. Use its
  // immutable ID in fixture inserts without changing production profile data.
  const {
    rows: [profile],
  } = await db.query<{ id: string }>(
    `SELECT id FROM market_profiles WHERE tenant_id=$1 AND owner_id=$2`,
    [DEMO_TENANT, DEMO_USERS.farmer],
  );
  profileId = profile.id;
  server = createApp(db, loadConfig({ AGRIBRIDGE_DEMO: "true" }), env).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
  const result = await call("/api/auth/demo", undefined, "POST", {
    role: "farmer",
  });
  seller = {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrfToken,
  };
  buyer = await login("order-buyer@example.test");
  other = await login("order-other@example.test");
});
let profileId = "order-test-profile";
after(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  if (db) await db.close();
});

test("market orders enforce identity, exact input, ownership and tenant scope", async () => {
  const id = await supply();
  assert.equal((await call("/api/marketplace/orders")).status, 401);
  assert.equal(
    (
      await call("/api/marketplace/orders", buyer, "POST", {
        supplyId: id,
        quantityKg: 1,
      })
    ).body.error.code,
    "IDEMPOTENCY_REQUIRED",
  );
  assert.equal(
    (
      await call(
        "/api/marketplace/orders",
        seller,
        "POST",
        { supplyId: id, quantityKg: 1 },
        randomUUID(),
      )
    ).body.error.code,
    "OWN_SUPPLY",
  );
  assert.equal(
    (
      await call(
        "/api/marketplace/orders",
        buyer,
        "POST",
        { supplyId: id, quantityKg: 1, sellerId: otherId },
        randomUUID(),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/marketplace/orders",
        other,
        "POST",
        { supplyId: id, quantityKg: 1 },
        randomUUID(),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        "/api/marketplace/orders",
        buyer,
        "POST",
        { supplyId: id, quantityKg: 101 },
        randomUUID(),
      )
    ).body.error.code,
    "QUANTITY_UNAVAILABLE",
  );
});

test("order values come from listing snapshots and identical retries create one request", async () => {
  const supplyId = await supply();
  const key = randomUUID();
  const body = { supplyId, quantityKg: 12 };
  const first = await call("/api/marketplace/orders", buyer, "POST", body, key);
  const replay = await call(
    "/api/marketplace/orders",
    buyer,
    "POST",
    body,
    key,
  );
  assert.equal(first.status, 201);
  assert.equal(replay.body.id, first.body.id);
  assert.equal(first.body.priceUgxPerKg, 1000);
  assert.equal(first.body.totalUgx, 12000);
  assert.equal(
    (
      await call(
        "/api/marketplace/orders",
        buyer,
        "POST",
        { ...body, quantityKg: 13 },
        key,
      )
    ).body.error.code,
    "IDEMPOTENCY_CONFLICT",
  );
  const list = await call("/api/marketplace/orders?limit=100", buyer);
  assert.equal(
    list.body.orders.filter((item: any) => item.id === first.body.id).length,
    1,
  );
  assert.equal(list.body.capabilities.checkoutEnabled, false);
});

test("only sellers accept, concurrent commitments cannot oversell, and cancellation releases stock", async () => {
  const id = await supply();
  const first = await requestOrder(id, 70),
    second = await requestOrder(id, 70);
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${first.id}`,
        buyer,
        "PATCH",
        { version: first.version, status: "accepted" },
        randomUUID(),
      )
    ).status,
    403,
  );
  const results = await Promise.all(
    [first, second].map((order) =>
      call(
        `/api/marketplace/orders/${order.id}`,
        seller,
        "PATCH",
        { version: order.version, status: "accepted" },
        randomUUID(),
      ),
    ),
  );
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  const accepted = results.find((item) => item.status === 200)!.body;
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${accepted.id}`,
        other,
        "PATCH",
        { version: accepted.version, status: "cancelled" },
        randomUUID(),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${accepted.id}`,
        seller,
        "PATCH",
        { version: 1, status: "cancelled" },
        randomUUID(),
      )
    ).body.error.code,
    "VERSION_CONFLICT",
  );
  const cancelled = await call(
    `/api/marketplace/orders/${accepted.id}`,
    seller,
    "PATCH",
    { version: accepted.version, status: "cancelled" },
    randomUUID(),
  );
  assert.equal(cancelled.status, 200);
  await accept(await requestOrder(id, 100));
});

test("accepted and fulfilled commitments protect supply quantity and agreed terms", async () => {
  const id = await supply();
  const order = await accept(await requestOrder(id, 40));
  const changed = await call(
    `/api/marketplace/supply/${id}`,
    seller,
    "PATCH",
    { version: 1, quantityKg: 20 },
    randomUUID(),
  );
  assert.equal(changed.status, 409);
  const repriced = await call(
    `/api/marketplace/supply/${id}`,
    seller,
    "PATCH",
    { version: 1, expectedPriceUgxPerKg: 1200 },
    randomUUID(),
  );
  assert.equal(repriced.status, 409);
  const fulfilled = await call(
    `/api/marketplace/orders/${order.id}`,
    seller,
    "PATCH",
    { version: order.version, status: "fulfilled" },
    randomUUID(),
  );
  assert.equal(fulfilled.status, 200);
  assert.equal(
    (
      await call(
        "/api/marketplace/orders",
        buyer,
        "POST",
        { supplyId: id, quantityKg: 61 },
        randomUUID(),
      )
    ).body.error.code,
    "QUANTITY_UNAVAILABLE",
  );
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${order.id}`,
        seller,
        "PATCH",
        { version: fulfilled.body.version, status: "cancelled" },
        randomUUID(),
      )
    ).body.error.code,
    "ORDER_FINAL",
  );
});

test("price changes, expired requests and quote-only listings require new client confirmation", async () => {
  const id = await supply();
  const order = await requestOrder(id);
  await db.query(
    `UPDATE market_supply SET expected_price_ugx_per_kg=1100 WHERE id=$1`,
    [id],
  );
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${order.id}`,
        seller,
        "PATCH",
        { version: order.version, status: "accepted" },
        randomUUID(),
      )
    ).body.error.code,
    "PRICE_RECONFIRMATION_REQUIRED",
  );
  const quote = await requestOrder(await supply(100, null));
  assert.equal(quote.totalUgx, null);
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${quote.id}`,
        seller,
        "PATCH",
        { version: quote.version, status: "accepted" },
        randomUUID(),
      )
    ).body.error.code,
    "PRICE_RECONFIRMATION_REQUIRED",
  );
  const expiring = await requestOrder(await supply());
  await db.query(
    `UPDATE market_orders SET expires_at=now()-interval '1 second' WHERE id=$1`,
    [expiring.id],
  );
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${expiring.id}`,
        seller,
        "PATCH",
        { version: expiring.version, status: "accepted" },
        randomUUID(),
      )
    ).body.error.code,
    "ORDER_EXPIRED",
  );
});

test("unverified or mismatched payment events cannot mark an order paid", async () => {
  const order = await accept(await requestOrder(await supply()));
  const event = paymentEvent(order);
  await assert.rejects(
    () =>
      recordVerifiedMarketPayment(db, event, {
        ...verified,
        verified: false,
      } as any),
    (error: any) => error.code === "PAYMENT_EVENT_UNVERIFIED",
  );
  await assert.rejects(
    () =>
      recordVerifiedMarketPayment(
        db,
        { ...event, amountUgx: event.amountUgx + 1 },
        verified,
      ),
    (error: any) => error.code === "PAYMENT_ORDER_MISMATCH",
  );
  await assert.rejects(
    () =>
      recordVerifiedMarketPayment(db, { ...event, payeeId: buyerId }, verified),
    (error: any) => error.code === "PAYMENT_ORDER_MISMATCH",
  );
  const requested = await requestOrder(await supply());
  await assert.rejects(
    () => recordVerifiedMarketPayment(db, paymentEvent(requested), verified),
    (error: any) => error.code === "ORDER_NOT_ACCEPTED",
  );
});

test("approval and payment confirmation create separate accurate, deduplicated seller notices", async () => {
  const order = await accept(await requestOrder(await supply()));
  const approval = paymentEvent(order);
  const result = await recordVerifiedMarketPayment(db, approval, verified);
  assert.equal(result.payment.status, "authorized");
  assert.equal(
    (await recordVerifiedMarketPayment(db, approval, verified)).duplicate,
    true,
  );
  const {
    rows: [notice],
  } = await db.query<any>(
    `SELECT * FROM market_payment_notifications WHERE payment_id=$1`,
    [result.payment.id],
  );
  assert.equal(notice.kind, "payment_approved");
  assert.match(notice.body, /Transfer is not yet confirmed/);
  assert.equal(notice.recipient_id, DEMO_USERS.farmer);
  assert.equal(notice.status, "pending_configuration");
  const success = {
    ...approval,
    eventId: randomUUID(),
    status: "succeeded" as const,
    occurredAt: new Date().toISOString(),
  };
  assert.equal(
    (await recordVerifiedMarketPayment(db, success, verified)).payment.status,
    "succeeded",
  );
  const notices = await call("/api/marketplace/payments/overview", seller);
  assert.equal(
    notices.body.notifications.filter(
      (item: any) => item.paymentId === result.payment.id,
    ).length,
    2,
  );
  assert.ok(
    notices.body.notifications.some(
      (item: any) =>
        item.kind === "payment_confirmed" &&
        /direct client-to-seller/.test(item.body),
    ),
  );
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${order.id}`,
        seller,
        "PATCH",
        { version: order.version, status: "cancelled" },
        randomUUID(),
      )
    ).body.error.code,
    "PAYMENT_RECONCILIATION_REQUIRED",
  );
});

test("stale payment events cannot regress success, refunds are separate and attempts cannot double pay", async () => {
  const order = await accept(await requestOrder(await supply()));
  const success = paymentEvent(order, { status: "succeeded" });
  const payment = await recordVerifiedMarketPayment(db, success, verified);
  const late = { ...success, eventId: randomUUID(), status: "failed" as const };
  const ignored = await recordVerifiedMarketPayment(db, late, verified);
  assert.equal(ignored.payment.status, "succeeded");
  assert.equal(ignored.applied, false);
  await assert.rejects(
    () =>
      recordVerifiedMarketPayment(
        db,
        { ...success, eventId: randomUUID(), transactionId: randomUUID() },
        verified,
      ),
    (error: any) => error.code === "PAYMENT_RECONCILIATION_REQUIRED",
  );
  const refunded = await recordVerifiedMarketPayment(
    db,
    {
      ...success,
      eventId: randomUUID(),
      status: "refunded",
      occurredAt: new Date().toISOString(),
    },
    verified,
  );
  assert.equal(refunded.payment.status, "refunded");
  assert.equal(
    (
      await call(
        `/api/marketplace/orders/${order.id}`,
        seller,
        "PATCH",
        { version: order.version, status: "cancelled" },
        randomUUID(),
      )
    ).status,
    200,
  );
  const staleAfterCancellation = await recordVerifiedMarketPayment(
    db,
    { ...success, eventId: randomUUID(), status: "failed" },
    verified,
  );
  assert.equal(staleAfterCancellation.payment.status, "refunded");
  assert.equal(staleAfterCancellation.applied, false);
  const {
    rows: [count],
  } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM market_payment_notifications WHERE payment_id=$1`,
    [payment.payment.id],
  );
  assert.equal(Number(count.count), 2);
});

test("provider event and transaction IDs cannot be reassigned and private status stays scoped", async () => {
  const order = await accept(await requestOrder(await supply()));
  const event = paymentEvent(order, { status: "succeeded" });
  await recordVerifiedMarketPayment(db, event, verified);
  await assert.rejects(
    () =>
      recordVerifiedMarketPayment(db, { ...event, status: "failed" }, verified),
    (error: any) => error.code === "PAYMENT_EVENT_CONFLICT",
  );
  const second = await accept(await requestOrder(await supply()));
  await assert.rejects(
    () =>
      recordVerifiedMarketPayment(
        db,
        { ...event, orderId: second.id, eventId: randomUUID() },
        verified,
      ),
    (error: any) => error.code === "PAYMENT_TRANSACTION_CONFLICT",
  );
  assert.equal(
    (await call("/api/marketplace/payments/overview", other)).body.payments
      .length,
    0,
  );
  assert.equal(
    (await call("/api/marketplace/payments/overview", other)).body.notifications
      .length,
    0,
  );
  assert.equal(
    (await call("/api/marketplace/payments/overview", buyer)).body.notifications
      .length,
    0,
  );
});

test("payment gateway authenticates raw bodies with bounded timestamps before accepting events", async () => {
  const order = await accept(await requestOrder(await supply()));
  const event = paymentEvent(order);
  const raw = JSON.stringify(event),
    timestamp = String(Math.floor(Date.now() / 1000));
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  const invalid = await fetch(url + "/api/marketplace/payments/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-timestamp": timestamp,
      "x-market-signature": "sha256=" + "0".repeat(64),
    },
    body: raw,
  });
  assert.equal(invalid.status, 401);
  const valid = await fetch(url + "/api/marketplace/payments/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-timestamp": timestamp,
      "x-market-signature": signature,
    },
    body: raw,
  });
  assert.equal(valid.status, 200);
  const expiredTimestamp = String(Math.floor(Date.now() / 1000) - 1000);
  const expiredSignature = `sha256=${createHmac("sha256", secret).update(`${expiredTimestamp}.${raw}`).digest("hex")}`;
  const expired = await fetch(url + "/api/marketplace/payments/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-market-timestamp": expiredTimestamp,
      "x-market-signature": expiredSignature,
    },
    body: raw,
  });
  assert.equal(expired.status, 401);
});
