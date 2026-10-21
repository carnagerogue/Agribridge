import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrate, type Database } from "../db.js";
import { seedDemo, DEMO_TENANT, DEMO_USERS } from "../seed.js";
import { buyerCookieName, setBuyerCookie } from "../buyer-auth.js";
import { marketToday } from "../marketplace.js";
import { sha256 } from "../security.js";

let db: Database,
  server: Server,
  nonDemoServer: Server,
  base: string,
  nonDemoBase: string;
const origin = "http://localhost:5180",
  config = loadConfig({ AGRIBRIDGE_DEMO: "true", PUBLIC_ORIGIN: origin });
type Client = { cookie: string; csrf: string; buyer: Record<string, any> };
let first: Client, second: Client;
const realTenant = "buyer-test-seller-organization",
  realSeller = "buyer-test-active-seller";
const realSupply = "81000000-0000-4000-8000-000000000001",
  privateSupply = "81000000-0000-4000-8000-000000000002";
const password = "Buyer-test-passphrase-42";
const day = (offset = 0) =>
  marketToday(new Date(Date.now() + offset * 86_400_000));
const signup = (phone = "+256700211111") => ({
  name: "Client One",
  businessName: "Test Produce Kitchen",
  phone,
  email: "client@example.org",
  district: "Kampala",
  community: "Central",
  password,
});

async function call(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    client?: Client;
    key?: string;
    origin?: string | null;
    csrf?: string;
    cookie?: string;
    base?: string;
  } = {},
) {
  const method = options.method || "GET";
  const response = await fetch(`${options.base || base}${path}`, {
    method,
    headers: {
      ...(method !== "GET" && options.origin !== null
        ? { origin: options.origin || origin }
        : {}),
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.client || options.cookie
        ? { cookie: options.cookie || options.client!.cookie }
        : {}),
      ...(options.client || options.csrf
        ? { "x-buyer-csrf-token": options.csrf ?? options.client!.csrf }
        : {}),
      ...(options.key ? { "idempotency-key": options.key } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    body: (await response.json()) as any,
    response,
  };
}
const client = (result: Awaited<ReturnType<typeof call>>): Client => ({
  cookie: result.response.headers.get("set-cookie")!.split(";")[0],
  csrf: result.body.csrfToken,
  buyer: result.body.buyer,
});
async function login(phone = first.buyer.phone) {
  const result = await call("/api/buyer/login", {
    method: "POST",
    body: { phone, password },
  });
  assert.equal(result.status, 200);
  return client(result);
}
const order = () => ({
  supplyId: realSupply,
  listingVersion: 1,
  quantityKg: 25,
  deliveryLocation: "Kampala receiving depot",
  requestedDeliveryDate: day(6),
  message: "Please confirm collection arrangements.",
});

before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await seedDemo(db);
  await db.query(
    "INSERT INTO organizations(id,name) VALUES($1,'Seller test organization')",
    [realTenant],
  );
  await db.query(
    "INSERT INTO users(id,tenant_id,name,role) VALUES($1,$2,'Seller public name','farmer')",
    [realSeller, realTenant],
  );
  const profileId = "80000000-0000-4000-8000-000000000001";
  await db.query(
    `INSERT INTO market_profiles(id,tenant_id,owner_id,name,business_name,phone,district,community,crops,language) VALUES($1,$2,$3,'PRIVATE person name','Public Seller Cooperative','+256700949499','Nakaseke','Kikandwa',ARRAY['Maize'],'en')`,
    [profileId, realTenant, realSeller],
  );
  for (const [id, published] of [
    [realSupply, true],
    [privateSupply, false],
  ] as const)
    await db.query(
      `INSERT INTO market_supply(id,tenant_id,owner_id,profile_id,crop,variety,quantity_kg,expected_price_ugx_per_kg,harvest_from,harvest_until,district,community,grade,quality_notes,published)
    VALUES($1,$2,$3,$4,'Maize','White maize',900,1500,$5,$6,'Nakaseke','Kikandwa','Seller declaration','PRIVATE operational quality note',$7)`,
      [id, realTenant, realSeller, profileId, day(2), day(20), published],
    );
  server = createApp(db, config, {}).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  nonDemoServer = createApp(
    db,
    loadConfig({ PUBLIC_ORIGIN: origin }),
    {},
  ).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) =>
    nonDemoServer.once("listening", resolve),
  );
  nonDemoBase = `http://127.0.0.1:${(nonDemoServer.address() as { port: number }).port}`;
  first = client(
    await call("/api/buyer/signup", { method: "POST", body: signup() }),
  );
  second = client(
    await call("/api/buyer/signup", {
      method: "POST",
      body: { ...signup("+256700222222"), name: "Client Two" },
    }),
  );
});
after(async () => {
  await Promise.all([
    new Promise<void>((resolve) => server.close(() => resolve())),
    new Promise<void>((resolve) => nonDemoServer.close(() => resolve())),
  ]);
  await db.close();
});

test("buyer signup stores a separate hashed identity and session without claiming phone verification or staff access", async () => {
  const result = await call("/api/buyer/session", { client: first });
  assert.equal(result.status, 200);
  assert.equal(result.body.buyer.phoneVerified, false);
  assert.equal(result.body.buyer.role, undefined);
  assert.equal(result.body.buyer.password, undefined);
  assert.equal(result.body.buyer.password_hash, undefined);
  assert.ok(first.cookie.startsWith("agribridge_buyer="));
  const stored = (
    await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM buyer_accounts WHERE id=$1",
      [first.buyer.id],
    )
  ).rows[0];
  assert.match(stored.password_hash, /^scrypt:/);
  assert.notEqual(stored.password_hash, password);
  const token = first.cookie.slice(first.cookie.indexOf("=") + 1);
  assert.equal(
    (
      await db.query(
        "SELECT token_hash FROM buyer_sessions WHERE token_hash=$1",
        [token],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT token_hash FROM buyer_sessions WHERE token_hash=$1",
        [sha256(token)],
      )
    ).rows.length,
    1,
  );
  assert.equal((await call("/api/bootstrap", { client: first })).status, 401);
  assert.equal(
    (await call("/api/admin/overview", { client: first })).status,
    401,
  );
  assert.equal(
    (await call("/api/marketplace/channel/buying-inquiries", { client: first }))
      .status,
    401,
  );
  assert.equal((await call("/api/buyer/session")).status, 401);
});

test("application cookies cannot substitute for a buyer session or its CSRF token", async () => {
  const farmer = await call("/api/auth/demo", {
    method: "POST",
    body: { role: "farmer" },
  });
  assert.equal(farmer.status, 200);
  const cookie = farmer.response.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await call("/api/buyer/session", { cookie })).status, 401);
  const wrong = await call("/api/buyer/orders", {
    method: "POST",
    body: order(),
    client: first,
    csrf: farmer.body.csrfToken,
    key: randomUUID(),
  });
  assert.equal(wrong.status, 403);
  assert.equal(
    (await call("/api/marketplace/channel/buying-inquiries", { cookie }))
      .status,
    403,
  );
});

test("exact origin, strict input and buyer-bound CSRF protect signup and order changes", async () => {
  assert.equal(
    (
      await call("/api/buyer/signup", {
        method: "POST",
        body: signup("+256700233333"),
        origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/buyer/signup", {
        method: "POST",
        body: signup("+256700233333"),
        origin: null,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/buyer/signup", {
        method: "POST",
        body: { ...signup("+256700233333"), password: "short" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/buyer/signup", {
        method: "POST",
        body: { ...signup("+256700233333"), role: "admin" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/buyer/signup", {
        method: "POST",
        body: { ...signup("+256700233333"), phoneVerified: true },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("/api/buyer/signup", { method: "POST", body: signup() }))
      .status,
    409,
  );
  assert.equal(
    (
      await call("/api/buyer/orders", {
        method: "POST",
        body: order(),
        client: first,
        csrf: "",
        key: randomUUID(),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/buyer/orders", {
        method: "POST",
        body: order(),
        client: first,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/buyer/orders", {
        method: "POST",
        body: order(),
        client: first,
        key: "not-a-uuid",
      })
    ).status,
    400,
  );
});

test("public catalog is an opt-in projection across organizations and filters before pagination", async () => {
  const result = await call(
    "/api/buyer/catalog?limit=1&crop=Maize&district=Nakaseke&minQuantityKg=800",
    { base: nonDemoBase },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 1);
  const row = result.body.items[0];
  assert.equal(row.id, realSupply);
  assert.equal(row.sellerName, "Public Seller Cooperative");
  assert.equal(row.availableQuantityKg, 900);
  assert.equal(row.qualityEvidence, "seller_declared");
  for (const key of [
    "phone",
    "email",
    "profileId",
    "sellerId",
    "sellerTenantId",
    "ownerId",
    "tenantId",
    "qualityNotes",
    "notes",
    "name",
  ])
    assert.equal(row[key], undefined);
  assert.doesNotMatch(
    JSON.stringify(result.body),
    /PRIVATE|700949499|buyer-test-active-seller/,
  );
  assert.ok(!result.body.items.some((item: any) => item.id === privateSupply));
  assert.equal(
    (await call("/api/buyer/catalog?minQuantityKg=1000", { base: nonDemoBase }))
      .body.items.length,
    0,
  );
  assert.equal(
    (await call("/api/buyer/catalog?q=cooperative", { base: nonDemoBase })).body
      .items.length,
    1,
  );
  assert.equal((await call("/api/buyer/catalog?phone=secret")).status, 400);
  assert.equal((await call("/api/buyer/catalog?offset=-1")).status, 400);
  await db.query("UPDATE users SET active=false WHERE id=$1", [realSeller]);
  try {
    assert.equal(
      (await call("/api/buyer/catalog", { base: nonDemoBase })).body.items
        .length,
      0,
    );
    assert.equal(
      (
        await call("/api/buyer/orders", {
          method: "POST",
          body: order(),
          client: first,
          key: randomUUID(),
        })
      ).status,
      404,
    );
  } finally {
    await db.query("UPDATE users SET active=true WHERE id=$1", [realSeller]);
  }
});

test("production catalog and direct requests do not turn published sample produce into a real order", async () => {
  const sampleId = "71000000-0000-4000-8000-000000000001";
  await db.query("UPDATE market_supply SET published=true WHERE id=$1", [
    sampleId,
  ]);
  const result = await call("/api/buyer/catalog", { base: nonDemoBase });
  assert.equal(result.body.sample, false);
  assert.ok(!result.body.items.some((item: any) => item.id === sampleId));
  const blocked = await call("/api/buyer/orders", {
    method: "POST",
    body: { ...order(), supplyId: sampleId },
    client: first,
    key: randomUUID(),
    base: nonDemoBase,
  });
  assert.equal(blocked.status, 404);
  assert.ok(
    (await call("/api/buyer/catalog")).body.items.some(
      (item: any) => item.id === sampleId,
    ),
  );
  assert.equal(
    (
      await call("/api/buyer/orders", {
        method: "POST",
        body: { ...order(), supplyId: privateSupply },
        client: first,
        key: randomUUID(),
      })
    ).status,
    404,
  );
});

test("buyer orders derive totals server-side, replay safely, and cannot be read or cancelled by another buyer", async () => {
  const key = randomUUID(),
    created = await call("/api/buyer/orders", {
      method: "POST",
      body: order(),
      client: first,
      key,
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.totalUgx, 37500);
  assert.equal(created.body.priceUgxPerKg, 1500);
  const repeated = await call("/api/buyer/orders", {
    method: "POST",
    body: order(),
    client: first,
    key,
  });
  assert.equal(repeated.body.id, created.body.id);
  const different = await call("/api/buyer/orders", {
    method: "POST",
    body: { ...order(), quantityKg: 30 },
    client: first,
    key,
  });
  assert.equal(different.status, 409);
  assert.equal(
    (
      await call("/api/buyer/orders", {
        method: "POST",
        body: { ...order(), priceUgxPerKg: 1 },
        client: first,
        key: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/buyer/orders", {
        method: "POST",
        body: { ...order(), listingVersion: 99 },
        client: first,
        key: randomUUID(),
      })
    ).status,
    409,
  );
  const own = await call("/api/buyer/orders", { client: first });
  assert.ok(own.body.orders.some((row: any) => row.id === created.body.id));
  assert.equal(own.body.capabilities.checkoutEnabled, false);
  assert.ok(
    !(await call("/api/buyer/orders", { client: second })).body.orders.some(
      (row: any) => row.id === created.body.id,
    ),
  );
  assert.equal(
    (
      await call(`/api/buyer/orders?buyerId=${first.buyer.id}`, {
        client: second,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/api/buyer/orders/${created.body.id}`, {
        method: "PATCH",
        body: { version: 1, status: "cancelled" },
        client: second,
        key: randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/api/buyer/orders/${created.body.id}`, {
        method: "PATCH",
        body: { version: 1, status: "cancelled" },
        client: first,
        key: randomUUID(),
      })
    ).status,
    200,
  );
});

test("login, expiry and logout revoke only buyer sessions and never leak credentials", async () => {
  const invalid = await call("/api/buyer/login", {
    method: "POST",
    body: { phone: first.buyer.phone, password: "wrong-password" },
  });
  assert.equal(invalid.status, 401);
  const missing = await call("/api/buyer/login", {
    method: "POST",
    body: { phone: "+256700299999", password },
  });
  assert.equal(missing.status, 401);
  const current = await login();
  const logout = await call("/api/buyer/logout", {
    method: "POST",
    body: {},
    client: current,
  });
  assert.equal(logout.status, 200);
  assert.match(
    logout.response.headers.get("set-cookie")!,
    /Expires=Thu, 01 Jan 1970/,
  );
  assert.equal(
    (await call("/api/buyer/session", { client: current })).status,
    401,
  );
  assert.equal(
    (await call("/api/buyer/session", { client: second })).status,
    200,
  );
  const expired = await login();
  const token = expired.cookie.slice(expired.cookie.indexOf("=") + 1);
  await db.query(
    "UPDATE buyer_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",
    [sha256(token)],
  );
  assert.equal(
    (await call("/api/buyer/session", { client: expired })).status,
    401,
  );
  await db.query("UPDATE buyer_accounts SET active=false WHERE id=$1", [
    first.buyer.id,
  ]);
  try {
    assert.equal(
      (await call("/api/buyer/session", { client: first })).status,
      401,
    );
  } finally {
    await db.query("UPDATE buyer_accounts SET active=true WHERE id=$1", [
      first.buyer.id,
    ]);
  }
});

test("production buyer cookies use the secure host prefix, HttpOnly and root path", () => {
  const production = { ...config, production: true, demo: false };
  assert.equal(buyerCookieName(production), "__Host-agribridge_buyer");
  let cookie: any;
  setBuyerCookie(
    {
      cookie: (name: string, token: string, settings: unknown) => {
        cookie = { name, token, settings };
      },
    } as any,
    production,
    "test-token",
  );
  assert.equal(cookie.settings.secure, true);
  assert.equal(cookie.settings.httpOnly, true);
  assert.equal(cookie.settings.path, "/");
  assert.equal(cookie.settings.sameSite, "lax");
});
