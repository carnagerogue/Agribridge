import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { z } from "zod";
import { openDatabase, migrate, type Database } from "../db.js";
import { loadConfig } from "../config.js";
import { ApiError, type AuthRequest, type User } from "../security.js";
import {
  mountMarketplace,
  listMarketDemand,
  listMarketServices,
  matchMarketSupply,
  marketToday,
  seedMarketplace,
} from "../marketplace.js";
import { seedDemo } from "../seed.js";
import { createMarketOrder, transitionMarketOrder } from "../market-orders.js";
import type { BuyerDemand, SupplyListing } from "../marketplace-types.js";

let db: Database, server: Server, base: string;
const users = new Map<string, User>();
const tenant = "market-test-tenant",
  otherTenant = "market-test-other";
const day = (offset = 0) =>
  marketToday(new Date(Date.now() + offset * 86_400_000));
async function actor(role: User["role"] = "farmer", organizationId = tenant) {
  const id = randomUUID(),
    user: User = {
      id,
      name: "Market test member",
      role,
      organizationId,
      organizationName: "Market test organization",
    };
  await db.query(
    "INSERT INTO users(id,tenant_id,name,role) VALUES($1,$2,$3,$4)",
    [id, organizationId, user.name, role],
  );
  users.set(id, user);
  return user;
}
async function call(
  user: User | undefined,
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const response = await fetch(`${base}/api/marketplace${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-member": user.id } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as any };
}
const profile = () => ({
  name: "Jane Farmer",
  businessName: "Jane's farm",
  phone: "0700123456",
  district: "Nakaseke",
  community: "Kikandwa",
  farmSizeAcres: 2.5,
  crops: ["Maize", "Beans"],
  language: "en",
});
const supply = () => ({
  crop: "Maize",
  variety: "White maize",
  quantityKg: 600,
  expectedPriceUgxPerKg: 1500,
  harvestFrom: day(2),
  harvestUntil: day(20),
  district: "Nakaseke",
  community: "Kikandwa",
  grade: "Seller-declared",
  qualityNotes: "Requires inspection",
});
const demand = () => ({
  organization: "Test buyer",
  crop: "Maize",
  variety: "White maize",
  grade: "Grade 1 after inspection",
  quantityKg: 1000,
  priceUgxPerKg: 1600,
  district: "Kampala",
  availableFrom: day(),
  deadline: day(25),
  requirements: "Confirm measured moisture and collection costs.",
});
const service = () => ({
  category: "input",
  name: "Test seed pack",
  provider: "Test supplier",
  district: "Nakaseke",
  community: "Kikandwa",
  crop: "Maize",
  priceUgx: 35000,
  unit: "2 kg pack",
  sourceTitle: "Supplier written quote",
  sourceUrl: "https://example.org/test-quote",
  observedAt: day(),
  validUntil: day(7),
  verificationStatus: "verified",
  notes: "A test quote, not a real price.",
});

before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  for (const id of [tenant, otherTenant])
    await db.query(
      "INSERT INTO organizations(id,name) VALUES($1,'Market test')",
      [id],
    );
  const app = express();
  app.use(express.json());
  // Exercise domain authorization in isolation; session/CSRF are covered by the app security suite.
  app.use((req: AuthRequest, _res, next) => {
    const user = users.get(req.get("x-test-member") || "");
    if (!user) return next(new ApiError(401, "UNAUTHENTICATED", "Sign in."));
    req.user = user;
    next();
  });
  mountMarketplace(app, db, loadConfig({}));
  app.use((error: any, _req: any, res: any, _next: any) =>
    res.status(error instanceof z.ZodError ? 400 : error.status || 500).json({
      error: { code: error.code || "INVALID_INPUT", message: error.message },
    }),
  );
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

test("business signup uses stable ownership, normalized phone and truthful verification, with replay and stale-write protection", async () => {
  const user = await actor(),
    key = randomUUID();
  assert.equal((await call(undefined, "/overview")).status, 401);
  const first = await call(user, "/profile", "POST", profile(), key);
  assert.equal(first.status, 201);
  assert.equal(first.body.phone, "+256700123456");
  assert.equal(first.body.phoneVerified, false);
  assert.match(first.body.id, /^[0-9a-f-]{36}$/);
  const repeat = await call(user, "/profile", "POST", profile(), key);
  assert.equal(repeat.body.id, first.body.id);
  assert.equal(
    (
      await call(
        user,
        "/profile",
        "POST",
        { ...profile(), name: "Changed" },
        key,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(user, "/profile", "POST", { ...profile(), name: "Changed" }))
      .status,
    400,
  );
  const updated = await call(user, "/profile", "POST", {
    ...profile(),
    name: "Changed",
    version: first.body.version,
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.version, 2);
  assert.equal(
    (await call(user, "/profile", "POST", { ...profile(), version: 1 })).status,
    409,
  );
  assert.equal(
    (
      await call(user, "/profile", "POST", {
        ...profile(),
        phoneVerified: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(user, "/profile", "POST", { ...profile(), crops: [] })).status,
    400,
  );
});

test("supply requires an owned profile, rejects invalid dates/ownership fields and preserves PATCH omissions", async () => {
  const user = await actor(),
    other = await actor();
  assert.equal((await call(user, "/supply", "POST", supply())).status, 409);
  assert.equal((await call(user, "/profile", "POST", profile())).status, 201);
  assert.equal(
    (
      await call(user, "/supply", "POST", {
        ...supply(),
        harvestUntil: day(-1),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(user, "/supply", "POST", {
        ...supply(),
        harvestFrom: "2026-02-30",
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(user, "/supply", "POST", { ...supply(), ownerId: other.id }))
      .status,
    400,
  );
  const created = await call(user, "/supply", "POST", supply(), randomUUID());
  assert.equal(created.status, 201);
  const change = await call(user, `/supply/${created.body.id}`, "PATCH", {
    version: 1,
    quantityKg: 800,
  });
  assert.equal(change.status, 200);
  assert.equal(change.body.quantityKg, 800);
  assert.equal(change.body.variety, supply().variety);
  assert.equal(change.body.expectedPriceUgxPerKg, 1500);
  assert.equal(
    (
      await call(user, `/supply/${created.body.id}`, "PATCH", {
        version: 1,
        quantityKg: 900,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(other, `/supply/${created.body.id}`, "PATCH", {
        version: 2,
        status: "sold",
      })
    ).status,
    404,
  );
  assert.equal((await call(other, "/overview")).body.supply.length, 0);
});

test("operators publish real scoped buyer requests; farmers request one durable introduction without gaining editing rights", async () => {
  const seller = await actor(),
    staff = await actor("operator"),
    outsider = await actor("operator", otherTenant);
  await call(seller, "/profile", "POST", profile());
  const lot = await call(seller, "/supply", "POST", supply());
  assert.equal((await call(seller, "/demand", "POST", demand())).status, 403);
  const request = await call(staff, "/demand", "POST", demand(), randomUUID());
  assert.equal(request.status, 201);
  const board = (await call(seller, "/overview")).body;
  assert.ok(board.demand.some((item: any) => item.id === request.body.id));
  const fit = board.matches.find(
    (item: any) =>
      item.supplyId === lot.body.id && item.demandId === request.body.id,
  );
  assert.equal(fit.quantityKg, 600);
  assert.ok(fit.checks.some((value: string) => value.includes("Transport")));
  assert.ok(fit.checks.some((value: string) => value.includes("inspection")));
  assert.ok(fit.checks.some((value: string) => value.includes("partial")));
  const interest = await call(
    seller,
    "/interest",
    "POST",
    {
      supplyId: lot.body.id,
      demandId: request.body.id,
      message: "Please connect us.",
    },
    randomUUID(),
  );
  assert.equal(interest.status, 201);
  assert.equal(interest.body.status, "submitted");
  const duplicate = await call(
    seller,
    "/interest",
    "POST",
    {
      supplyId: lot.body.id,
      demandId: request.body.id,
      message: "Same request again",
    },
    randomUUID(),
  );
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.id, interest.body.id);
  assert.equal(
    (
      await call(seller, `/interest/${interest.body.id}`, "PATCH", {
        version: 1,
        status: "acknowledged",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(outsider, `/interest/${interest.body.id}`, "PATCH", {
        version: 1,
        status: "acknowledged",
      })
    ).status,
    404,
  );
  const acknowledge = await call(
    staff,
    `/interest/${interest.body.id}`,
    "PATCH",
    { version: 1, status: "acknowledged" },
  );
  assert.equal(acknowledge.status, 200);
  assert.equal(
    (
      await call(staff, `/interest/${interest.body.id}`, "PATCH", {
        version: acknowledge.body.version,
        status: "closed",
      })
    ).status,
    200,
  );
  const closedRequest = await call(seller, "/interest", "POST", {
    supplyId: lot.body.id,
    demandId: request.body.id,
  });
  assert.equal(closedRequest.status, 409);
  assert.equal(closedRequest.body.error.code, "INTRODUCTION_CLOSED");
  assert.equal(
    (
      await call(staff, `/demand/${request.body.id}`, "PATCH", {
        version: 1,
        status: "closed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(seller, "/interest", "POST", {
        supplyId: lot.body.id,
        demandId: request.body.id,
      })
    ).status,
    409,
  );
});

test("service prices preserve source, unit and freshness; callers can exclude expired, unrelated and sample records", async () => {
  const staff = await actor("operator"),
    farmer = await actor();
  assert.equal(
    (await call(farmer, "/services", "POST", service())).status,
    403,
  );
  assert.equal(
    (
      await call(staff, "/services", "POST", {
        ...service(),
        sourceUrl: "http://example.org/unsafe",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(staff, "/services", "POST", {
        ...service(),
        observedAt: day(1),
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(staff, "/services", "POST", { ...service(), priceUgx: -10 }))
      .status,
    400,
  );
  const record = await call(staff, "/services", "POST", service());
  assert.equal(record.status, 201);
  assert.equal(record.body.unit, "2 kg pack");
  assert.equal(record.body.freshness, "current");
  assert.equal(record.body.sourceTitle, "Supplier written quote");
  const expired = await call(staff, "/services", "POST", {
    ...service(),
    name: "Expired test quote",
    observedAt: day(-20),
    validUntil: day(-1),
  });
  assert.equal(expired.status, 201);
  assert.equal(expired.body.freshness, "expired");
  const current = await listMarketServices(db, tenant, {
    crop: "maize",
    category: "input",
    district: "nakaseke",
  });
  assert.ok(current.some((item) => item.id === record.body.id));
  assert.ok(current.every((item) => item.freshness === "current"));
  assert.ok(!current.some((item) => item.id === expired.body.id));
  assert.deepEqual(await listMarketServices(db, otherTenant), []);
  assert.deepEqual(
    await listMarketServices(db, tenant, { category: "storage" }),
    [],
  );
  const changed = await call(staff, `/services/${record.body.id}`, "PATCH", {
    version: 1,
    priceUgx: 36000,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.unit, "2 kg pack");
  assert.equal(changed.body.priceUgx, 36000);
});

test("compatibility excludes wrong crops/varieties and nonoverlapping or expired windows, and never certifies grade", () => {
  const baseRecord = {
    id: "supply",
    version: 1,
    sample: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const declared: SupplyListing = {
    ...baseRecord,
    ...supply(),
    profileId: "profile",
    status: "available",
  };
  const request: BuyerDemand = {
    ...baseRecord,
    ...demand(),
    id: "buyer",
    status: "open",
  };
  assert.equal(matchMarketSupply([declared], [request]).length, 1);
  for (const changed of [
    { crop: "Coffee" },
    { variety: "Yellow maize" },
    { deadline: day(1) },
    { deadline: day(-1) },
    { status: "closed" as const },
  ])
    assert.equal(
      matchMarketSupply([declared], [{ ...request, ...changed }]).length,
      0,
    );
  assert.equal(
    matchMarketSupply([{ ...declared, harvestUntil: day(-1) }], [request])
      .length,
    0,
  );
  const unknown = matchMarketSupply(
    [{ ...declared, variety: "", expectedPriceUgxPerKg: null }],
    [{ ...request, priceUgxPerKg: null }],
  )[0];
  assert.equal(unknown.estimatedGrossUgx, null);
  assert.ok(
    unknown.checks.some((value) => value.includes("Confirm the variety")),
  );
  assert.ok(
    unknown.checks.some((value) => value.includes("not an executable quote")),
  );
  assert.ok(unknown.checks.some((value) => value.includes("inspection")));
});

test("catalog deliberately publishes same-organization supply but not phone/profile fields, and pagination is explicit", async () => {
  const seller = await actor(),
    buyer = await actor(),
    outsider = await actor("farmer", otherTenant);
  await call(seller, "/profile", "POST", {
    ...profile(),
    phone: "+256700987654",
  });
  const lot = await call(seller, "/supply", "POST", supply());
  const catalog = await call(buyer, "/catalog?limit=1");
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.supply.length, 1);
  assert.equal(typeof catalog.body.pagination.hasMore, "boolean");
  const all = await call(buyer, "/catalog?limit=100");
  const listed = all.body.supply.find((item: any) => item.id === lot.body.id);
  assert.equal(listed.sellerId, seller.id);
  assert.equal(listed.sellerName, "Jane's farm");
  assert.equal(listed.remainingQuantityKg, 600);
  assert.equal(listed.phone, undefined);
  assert.equal(listed.name, undefined);
  assert.ok(!JSON.stringify(all.body).includes("+256700987654"));
  assert.ok(
    !(await call(outsider, "/catalog")).body.supply.some(
      (item: any) => item.id === lot.body.id,
    ),
  );
  const own = await call(buyer, "/overview?limit=1");
  assert.equal(own.body.supply.length, 0);
  assert.equal((await call(buyer, "/overview?limit=101")).status, 400);
  assert.equal((await call(buyer, "/catalog?limit=1&offset=-1")).status, 400);
});

test("sample seed is repeatable and never becomes production demand or service prices", async () => {
  await seedDemo(db);
  await seedMarketplace(db);
  const first = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM market_demand WHERE sample=true",
  );
  await seedMarketplace(db);
  assert.equal(
    (
      await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM market_demand WHERE sample=true",
      )
    ).rows[0].count,
    first.rows[0].count,
  );
  assert.deepEqual(await listMarketDemand(db, "org-demo-nakaseke"), []);
  assert.deepEqual(await listMarketServices(db, "org-demo-nakaseke"), []);
  assert.ok(
    (
      await listMarketDemand(db, "org-demo-nakaseke", { includeSample: true })
    ).every((item) => item.sample),
  );
  assert.ok(
    (
      await listMarketServices(db, "org-demo-nakaseke", { includeSample: true })
    ).every((item) => item.verificationStatus === "sample"),
  );
});

test("database constraints reject cross-organization profile ownership even when raw SQL bypasses API guards", async () => {
  const owner = await actor(),
    other = await actor("farmer", otherTenant);
  const created = await call(owner, "/profile", "POST", profile());
  await assert.rejects(
    db.query(
      `INSERT INTO market_supply(id,tenant_id,owner_id,profile_id,crop,quantity_kg,harvest_from,harvest_until,district,community)
    VALUES($1,$2,$3,$4,'Maize',1,$5,$6,'Nakaseke','Kikandwa')`,
      [randomUUID(), otherTenant, other.id, created.body.id, day(), day(3)],
    ),
    /foreign key/i,
  );
});

test("accepted and fulfilled orders reduce catalog stock and protect the committed listing from changes", async () => {
  const seller = await actor(),
    buyer = await actor();
  await call(seller, "/profile", "POST", profile());
  const created = await call(seller, "/supply", "POST", supply());
  const order = await db.transaction((tx) =>
    createMarketOrder(tx, buyer, {
      supplyId: created.body.id,
      quantityKg: 400,
    }),
  );
  const accepted = await db.transaction((tx) =>
    transitionMarketOrder(tx, seller, order.id, {
      version: order.version,
      status: "accepted",
    }),
  );
  assert.equal(accepted.status, "accepted");
  let listing = (await call(buyer, "/catalog?limit=100")).body.supply.find(
    (item: any) => item.id === created.body.id,
  );
  assert.equal(listing.remainingQuantityKg, 200);
  const buyerRequest = await call(
    await actor("operator"),
    "/demand",
    "POST",
    demand(),
  );
  const remainingMatch = (
    await call(seller, "/overview?limit=100")
  ).body.matches.find(
    (item: any) =>
      item.supplyId === created.body.id &&
      item.demandId === buyerRequest.body.id,
  );
  assert.equal(remainingMatch.quantityKg, 200);
  assert.equal(remainingMatch.coveragePercent, 20);
  assert.equal(
    (
      await call(seller, `/supply/${created.body.id}`, "PATCH", {
        version: 1,
        quantityKg: 300,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(seller, `/supply/${created.body.id}`, "PATCH", {
        version: 1,
        expectedPriceUgxPerKg: 1600,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(seller, `/supply/${created.body.id}`, "PATCH", {
        version: 1,
        grade: "Changed commercial grade",
      })
    ).status,
    409,
  );
  const notes = await call(seller, `/supply/${created.body.id}`, "PATCH", {
    version: 1,
    qualityNotes: "Collection instructions clarified.",
  });
  assert.equal(notes.status, 200);
  await db.transaction((tx) =>
    transitionMarketOrder(tx, seller, order.id, {
      version: accepted.version,
      status: "fulfilled",
    }),
  );
  listing = (await call(buyer, "/catalog?limit=100")).body.supply.find(
    (item: any) => item.id === created.body.id,
  );
  assert.equal(listing.remainingQuantityKg, 200);
  assert.equal(
    (
      await call(seller, `/supply/${created.body.id}`, "PATCH", {
        version: notes.body.version,
        quantityKg: 399,
      })
    ).status,
    409,
  );
});
