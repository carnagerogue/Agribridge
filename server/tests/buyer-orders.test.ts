import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { openDatabase, migrate, type Database } from "../db.js";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { seedDemo, DEMO_TENANT, DEMO_USERS } from "../seed.js";
import { hashPassword } from "../security.js";
import { committedMarketQuantity } from "../marketplace.js";
import { createBuyerOrder } from "../buyer-orders.js";

let db: Database, server: Server, url: string;
type Client = { cookie: string; csrf: string; buyer?: boolean; id?: string };
let seller: Client,
  staff: Client,
  outsideSeller: Client,
  buyer: Client,
  otherBuyer: Client;
const origin = "http://localhost:5180";
const outsideTenant = "buyer-order-other-cooperative";
const outsideId = "buyer-order-other-seller";
const when = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
/** Optional PostgreSQL run uses real concurrent connections and a disposable DB. */
async function orderDatabase(): Promise<Database> {
  const target = process.env.TEST_DATABASE_URL;
  if (!target) return openDatabase({ databasePath: ":memory:" });
  const name = `agribridge_buyer_orders_${randomUUID().replaceAll("-", "")}`;
  const admin = await openDatabase({ databaseUrl: target, databasePath: "" });
  let created = false;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    created = true;
    const databaseUrl = new URL(target);
    databaseUrl.pathname = `/${name}`;
    const database = await openDatabase({
      databaseUrl: databaseUrl.toString(),
      databasePath: "",
    });
    return {
      ...database,
      async close() {
        try {
          await database.close();
          await admin.query(`DROP DATABASE ${name}`);
        } finally {
          await admin.close();
        }
      },
    };
  } catch (error) {
    try {
      if (created) await admin.query(`DROP DATABASE ${name}`);
    } finally {
      await admin.close();
    }
    throw error;
  }
}
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
      origin,
      ...(client
        ? {
            cookie: client.cookie,
            [client.buyer ? "x-buyer-csrf-token" : "x-csrf-token"]: client.csrf,
          }
        : {}),
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
async function signup(phone: string, name: string): Promise<Client> {
  const result = await call("/api/buyer/signup", undefined, "POST", {
    name,
    businessName: `${name} Buyers`,
    phone,
    password: "Buyer-order-test-password-123",
    district: "Kampala",
    community: "Test buyer area",
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.buyer.phoneVerified, false);
  return {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrfToken,
    buyer: true,
    id: result.body.buyer.id,
  };
}
async function demo(role: string): Promise<Client> {
  const result = await call("/api/auth/demo", undefined, "POST", { role });
  assert.equal(result.status, 200);
  return {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrfToken,
  };
}
async function listing(
  options: {
    quantity?: number;
    price?: number | null;
    published?: boolean;
    outside?: boolean;
    sample?: boolean;
  } = {},
) {
  const tenant = options.outside ? outsideTenant : DEMO_TENANT,
    owner = options.outside ? outsideId : DEMO_USERS.farmer;
  const {
    rows: [profile],
  } = await db.query<{ id: string }>(
    `SELECT id FROM market_profiles WHERE tenant_id=$1 AND owner_id=$2`,
    [tenant, owner],
  );
  const id = randomUUID();
  await db.query(
    `INSERT INTO market_supply(id,tenant_id,owner_id,profile_id,crop,variety,quantity_kg,expected_price_ugx_per_kg,harvest_from,harvest_until,district,community,grade,status,sample,published)
    VALUES($1,$2,$3,$4,'Maize','Buyer order test variety',$5,$6,$7,$8,'Nakaseke','Private household area','Seller-declared Grade 2','available',$9,$10)`,
    [
      id,
      tenant,
      owner,
      profile.id,
      options.quantity ?? 100,
      options.price === undefined ? 1000 : options.price,
      when(2),
      when(30),
      options.sample ?? false,
      options.published ?? true,
    ],
  );
  return id;
}
const input = (id: string, quantity = 50) => ({
  supplyId: id,
  listingVersion: 1,
  quantityKg: quantity,
  deliveryLocation: "Client collection point in Kampala",
  requestedDeliveryDate: when(5),
  message: "Please confirm collection arrangements.",
});
async function request(id: string, quantity = 50, client = buyer) {
  const result = await call(
    "/api/buyer/orders",
    client,
    "POST",
    input(id, quantity),
    randomUUID(),
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
async function transition(order: any, status: string, client = seller) {
  return call(
    `/api/marketplace/buyer-orders/${order.id}`,
    client,
    "PATCH",
    { version: order.version, status },
    randomUUID(),
  );
}
before(async () => {
  db = await orderDatabase();
  await migrate(db);
  await seedDemo(db);
  await db.query(
    `INSERT INTO organizations(id,name) VALUES($1,'Separate cooperative')`,
    [outsideTenant],
  );
  const hash = await hashPassword("Buyer-order-test-password-123");
  await db.query(
    `INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES($1,$2,'Separate seller','buyer-order-seller@example.test',$3,'farmer')`,
    [outsideId, outsideTenant, hash],
  );
  await db.query(
    `INSERT INTO market_profiles(id,tenant_id,owner_id,name,business_name,phone,district,community,crops,language) VALUES('buyer-order-other-profile',$1,$2,'Separate seller','Separate seller business','+256700098281','Nakaseke','Separate community',ARRAY['Maize'],'en')`,
    [outsideTenant, outsideId],
  );
  server = createApp(
    db,
    loadConfig({ AGRIBRIDGE_DEMO: "true", PUBLIC_ORIGIN: origin }),
    {},
  ).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
  seller = await demo("farmer");
  staff = await demo("operator");
  const outside = await call("/api/auth/login", undefined, "POST", {
    email: "buyer-order-seller@example.test",
    password: "Buyer-order-test-password-123",
  });
  assert.equal(outside.status, 200);
  outsideSeller = {
    cookie: outside.response.headers.get("set-cookie")!.split(";")[0],
    csrf: outside.body.csrfToken,
  };
  buyer = await signup("+256700098291", "Test Client One");
  otherBuyer = await signup("+256700098292", "Test Client Two");
});
after(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  if (db) await db.close();
});

test("seller publication is explicit, scoped, versioned and publicly sanitized", async () => {
  const id = await listing({ published: false });
  assert.ok(
    !(await call("/api/buyer/catalog?limit=100")).body.items.some(
      (row: any) => row.id === id,
    ),
  );
  assert.equal(
    (
      await call(
        `/api/marketplace/supply/${id}/publication`,
        buyer,
        "POST",
        { version: 1, published: true },
        randomUUID(),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        `/api/marketplace/supply/${id}/publication`,
        outsideSeller,
        "POST",
        { version: 1, published: true },
        randomUUID(),
      )
    ).status,
    404,
  );
  const published = await call(
    `/api/marketplace/supply/${id}/publication`,
    seller,
    "POST",
    { version: 1, published: true },
    randomUUID(),
  );
  assert.equal(published.status, 200);
  assert.equal(published.body.published, true);
  assert.equal(published.body.version, 2);
  assert.equal(
    (
      await call(
        `/api/marketplace/supply/${id}/publication`,
        seller,
        "POST",
        { version: 1, published: false },
        randomUUID(),
      )
    ).body.error.code,
    "VERSION_CONFLICT",
  );
  const item = (await call("/api/buyer/catalog?limit=100")).body.items.find(
    (row: any) => row.id === id,
  );
  assert.ok(item);
  for (const key of [
    "ownerId",
    "sellerId",
    "tenantId",
    "profileId",
    "phone",
    "email",
    "notes",
    "latitude",
    "longitude",
  ])
    assert.equal(Object.hasOwn(item, key), false, key);
  const own = await call("/api/marketplace/overview", seller);
  assert.equal(
    own.body.supply.find((row: any) => row.id === id).published,
    true,
  );
});

test("buyer identities and request CSRF never grant farmer or staff permissions", async () => {
  const id = await listing();
  assert.equal((await call("/api/marketplace/overview", buyer)).status, 401);
  assert.equal((await call("/api/buyer/orders", seller)).status, 401);
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        undefined,
        "POST",
        input(id),
        randomUUID(),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        { ...buyer, csrf: "invalid" },
        "POST",
        input(id),
        randomUUID(),
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/buyer/orders", buyer, "POST", input(id))).body.error.code,
    "BUYER_IDEMPOTENCY_REQUIRED",
  );
});

test("client order snapshots are server derived, version checked and atomically idempotent", async () => {
  const id = await listing();
  const key = randomUUID();
  const body = input(id, 12);
  const first = await call("/api/buyer/orders", buyer, "POST", body, key);
  const replay = await call("/api/buyer/orders", buyer, "POST", body, key);
  assert.equal(first.status, 201);
  assert.equal(replay.body.id, first.body.id);
  assert.equal(first.body.totalUgx, 12000);
  assert.equal(first.body.priceUgxPerKg, 1000);
  assert.equal(first.body.deliveryLocation, body.deliveryLocation);
  for (const field of [
    "buyerId",
    "sellerId",
    "sellerTenantId",
    "phone",
    "email",
  ])
    assert.equal(Object.hasOwn(first.body, field), false, field);
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        { ...body, quantityKg: 13 },
        key,
      )
    ).body.error.code,
    "BUYER_IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        { ...body, totalUgx: 1 },
        randomUUID(),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        { ...body, listingVersion: 99 },
        randomUUID(),
      )
    ).body.error.code,
    "LISTING_CHANGED",
  );
  assert.equal(
    (await call("/api/buyer/orders", buyer)).body.capabilities.checkoutEnabled,
    false,
  );
  assert.equal(
    (await call("/api/buyer/orders", buyer)).body.capabilities
      .totalIncludesTransport,
    false,
  );
});

test("private, paused, expired, suspended and quote-only supply cannot become public buyer orders", async () => {
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        input(await listing({ published: false })),
        randomUUID(),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        input(await listing({ price: null })),
        randomUUID(),
      )
    ).body.error.code,
    "QUOTE_REQUIRED",
  );
  const paused = await listing();
  await db.query(`UPDATE market_supply SET status='paused' WHERE id=$1`, [
    paused,
  ]);
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        input(paused),
        randomUUID(),
      )
    ).body.error.code,
    "SUPPLY_UNAVAILABLE",
  );
  const expired = await listing();
  await db.query(
    `UPDATE market_supply SET harvest_from=$2,harvest_until=$3 WHERE id=$1`,
    [expired, when(-5), when(-1)],
  );
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        input(expired),
        randomUUID(),
      )
    ).body.error.code,
    "SUPPLY_UNAVAILABLE",
  );
  const otherListing = await listing({ outside: true });
  await db.query(`UPDATE users SET active=false WHERE id=$1`, [outsideId]);
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        input(otherListing),
        randomUUID(),
      )
    ).status,
    404,
  );
  await db.query(`UPDATE users SET active=true WHERE id=$1`, [outsideId]);
  const sampleSupply = await listing({ outside: true, sample: true });
  await assert.rejects(
    () =>
      db.transaction((tx) =>
        createBuyerOrder(
          tx,
          { id: buyer.id!, name: "Test", businessName: "" },
          input(sampleSupply),
        ),
      ),
    (e: any) => e.code === "NOT_FOUND",
  );
  const sampleProfileSupply = await listing({ sample: false });
  await assert.rejects(
    () =>
      db.transaction((tx) =>
        createBuyerOrder(
          tx,
          { id: buyer.id!, name: "Test", businessName: "" },
          input(sampleProfileSupply),
        ),
      ),
    (e: any) => e.code === "NOT_FOUND",
  );
});

test("buyer orders stay private to the requesting client and seller organization", async () => {
  const order = await request(await listing());
  assert.ok(
    (await call("/api/buyer/orders", buyer)).body.orders.some(
      (row: any) => row.id === order.id,
    ),
  );
  assert.ok(
    !(await call("/api/buyer/orders", otherBuyer)).body.orders.some(
      (row: any) => row.id === order.id,
    ),
  );
  assert.equal(
    (
      await call(
        `/api/buyer/orders/${order.id}`,
        otherBuyer,
        "PATCH",
        { version: 1, status: "cancelled" },
        randomUUID(),
      )
    ).status,
    404,
  );
  assert.ok(
    (await call("/api/marketplace/buyer-orders", seller)).body.orders.some(
      (row: any) => row.id === order.id,
    ),
  );
  assert.ok(
    !(
      await call("/api/marketplace/buyer-orders", outsideSeller)
    ).body.orders.some((row: any) => row.id === order.id),
  );
  assert.equal(
    (await transition(order, "accepted", outsideSeller)).status,
    404,
  );
});

test("one buyer acceptance racing an internal acceptance cannot oversell either inventory surface", async () => {
  const id = await listing({ quantity: 100 });
  const external = await request(id, 70);
  const internalResult = await call(
    "/api/marketplace/orders",
    staff,
    "POST",
    { supplyId: id, quantityKg: 70 },
    randomUUID(),
  );
  assert.equal(internalResult.status, 201);
  const internal = internalResult.body;
  const results = await Promise.all([
    transition(external, "accepted"),
    call(
      `/api/marketplace/orders/${internal.id}`,
      seller,
      "PATCH",
      { version: internal.version, status: "accepted" },
      randomUUID(),
    ),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await committedMarketQuantity(db, DEMO_TENANT, id), 70);
  const publicRow = (
    await call("/api/buyer/catalog?limit=100")
  ).body.items.find((row: any) => row.id === id);
  assert.equal(publicRow.availableQuantityKg, 30);
  const internalRow = (
    await call("/api/marketplace/catalog?limit=100", seller)
  ).body.supply.find((row: any) => row.id === id);
  assert.equal(internalRow.remainingQuantityKg, 30);
  assert.equal(
    (
      await call(
        `/api/marketplace/supply/${id}`,
        seller,
        "PATCH",
        { version: 1, quantityKg: 69 },
        randomUUID(),
      )
    ).body.error.code,
    "STOCK_COMMITTED",
  );
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        input(id, 31),
        randomUUID(),
      )
    ).body.error.code,
    "QUANTITY_UNAVAILABLE",
  );
});

test("public commitments protect terms and remain consumed after fulfillment", async () => {
  const id = await listing();
  const requested = await request(id, 60);
  const accepted = await transition(requested, "accepted");
  assert.equal(accepted.status, 200);
  assert.equal(
    (
      await call(
        `/api/marketplace/supply/${id}`,
        seller,
        "PATCH",
        { version: 1, expectedPriceUgxPerKg: 1200 },
        randomUUID(),
      )
    ).body.error.code,
    "STOCK_COMMITTED",
  );
  assert.equal(
    (
      await call(
        `/api/buyer/orders/${requested.id}`,
        buyer,
        "PATCH",
        { version: accepted.body.version, status: "cancelled" },
        randomUUID(),
      )
    ).body.error.code,
    "SELLER_CANCELLATION_REQUIRED",
  );
  const fulfilled = await transition(accepted.body, "fulfilled");
  assert.equal(fulfilled.status, 200);
  assert.equal(await committedMarketQuantity(db, DEMO_TENANT, id), 60);
  assert.equal(
    (await transition(fulfilled.body, "cancelled")).body.error.code,
    "ORDER_FINAL",
  );
  assert.equal(
    (
      await call(
        "/api/marketplace/orders",
        staff,
        "POST",
        { supplyId: id, quantityKg: 41 },
        randomUUID(),
      )
    ).body.error.code,
    "QUANTITY_UNAVAILABLE",
  );
});

test("cancellation releases stock and unpublishing stops new clients without erasing accepted commitments", async () => {
  const id = await listing();
  const requested = await request(id, 60);
  const accepted = await transition(requested, "accepted");
  assert.equal(accepted.status, 200);
  assert.equal(
    (
      await call(
        `/api/marketplace/supply/${id}/publication`,
        seller,
        "POST",
        { version: 1, published: false },
        randomUUID(),
      )
    ).status,
    200,
  );
  assert.equal(await committedMarketQuantity(db, DEMO_TENANT, id), 60);
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        { ...input(id), listingVersion: 2 },
        randomUUID(),
      )
    ).status,
    404,
  );
  const cancelled = await transition(accepted.body, "cancelled");
  assert.equal(cancelled.status, 200);
  assert.equal(await committedMarketQuantity(db, DEMO_TENANT, id), 0);
});

test("stale terms, expired requests and invalid requested dates need explicit reconfirmation", async () => {
  const id = await listing();
  const requested = await request(id);
  await db.query(
    `UPDATE market_supply SET expected_price_ugx_per_kg=1100,version=version+1 WHERE id=$1`,
    [id],
  );
  assert.equal(
    (await transition(requested, "accepted")).body.error.code,
    "TERMS_CHANGED",
  );
  const expiring = await request(await listing());
  await db.query(
    `UPDATE buyer_orders SET expires_at=now()-interval '1 second' WHERE id=$1`,
    [expiring.id],
  );
  assert.equal(
    (await transition(expiring, "accepted")).body.error.code,
    "ORDER_EXPIRED",
  );
  const dateListing = await listing();
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        { ...input(dateListing), requestedDeliveryDate: when(-1) },
        randomUUID(),
      )
    ).body.error.code,
    "DELIVERY_DATE_INVALID",
  );
  assert.equal(
    (
      await call(
        "/api/buyer/orders",
        buyer,
        "POST",
        { ...input(dateListing), requestedDeliveryDate: "2026-02-30" },
        randomUUID(),
      )
    ).status,
    400,
  );
});
