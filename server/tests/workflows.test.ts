import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { openDatabase, migrate, type Database } from "../db.js";
import { loadConfig } from "../config.js";
import { createApp } from "../app.js";
import { seedDemo } from "../seed.js";
import { ugandaCalendarDay } from "../workflows.js";

let db: Database, server: Server, url: string;
type Client = { cookie: string; csrf: string };
let farmer: Client, operator: Client;
async function call(
  path: string,
  client?: Client,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(client ? { cookie: client.cookie, "x-csrf-token": client.csrf } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as any,
    cookie: response.headers.get("set-cookie")?.split(";")[0],
  };
}
async function demo(role: string) {
  const result = await call("/api/auth/demo", undefined, "POST", { role });
  return { cookie: result.cookie!, csrf: result.body.csrfToken };
}
before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await seedDemo(db);
  server = createApp(db, loadConfig({ AGRIBRIDGE_DEMO: "true" }), {}).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
  farmer = await demo("farmer");
  operator = await demo("operator");
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await db.close();
});
const seasonInput = () => ({
  farmId: "farm-grace-maize",
  name: "Sample test season",
  crop: "Maize",
  areaAcres: 3,
  plantingDate: "2026-03-01",
  expectedHarvestDate: "2026-07-01",
  expectedHarvestKg: 2000,
  reserveKg: 200,
  expectedPriceUgx: 1500,
  contingencyUgx: 50000,
  status: "active",
  costs: [
    {
      id: "seed-cost",
      category: "seed",
      label: "Seed",
      plannedUgx: 200000,
      actualUgx: 180000,
    },
    {
      id: "labour-cost",
      category: "labour",
      label: "Labour",
      plannedUgx: 300000,
      actualUgx: null,
    },
  ],
  sales: [],
  harvestedKg: 1500,
  notes: "Sample assumptions only.",
});
const lotInput = () => ({
  farmId: "farm-grace-maize",
  crop: "Maize",
  harvestDate: "2026-07-01",
  quantityKg: 500,
  bagCount: 10,
  storageLocation: "Sample store A",
  moisturePercent: null,
  measurementMethod: "not_recorded",
  testReference: "",
  qualityStatus: "unassessed",
  qualityNotes: "",
  notes: "Sample lot.",
});
async function newLot(input: Record<string, unknown> = {}) {
  const result = await call("/api/lots", farmer, "POST", {
    ...lotInput(),
    ...input,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
async function acceptLot(id: string, version: number) {
  const result = await call(`/api/lots/${id}`, operator, "PATCH", {
    version,
    qualityStatus: "accepted",
    qualityNotes: "Sample internal inspection only; not certification.",
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}
const collectionInput = (ids: string[]) => ({
  name: "Sample buyer collection",
  crop: "Maize",
  buyer: "Example buyer",
  targetKg: 500,
  priceUgxPerKg: 1500,
  collectionDate: "2026-10-01",
  meetingPoint: "Sample cooperative store",
  destination: "Kampala",
  status: "planning",
  lotIds: ids,
  notes: "No payment or certification implied.",
});

test("Uganda domain dates advance at EAT midnight, independently of server timezone", () => {
  assert.equal(
    ugandaCalendarDay(new Date("2026-09-27T20:59:59Z")),
    "2026-09-27",
  );
  assert.equal(
    ugandaCalendarDay(new Date("2026-09-27T21:00:00Z")),
    "2026-09-28",
  );
  assert.equal(
    ugandaCalendarDay(new Date("2026-12-31T23:30:00Z")),
    "2027-01-01",
  );
});

test("season calculations use entered values and distinguish missing actual costs from zero", async () => {
  const key = randomUUID();
  const input = seasonInput();
  const created = await call("/api/seasons", farmer, "POST", input, key);
  assert.equal(created.status, 201);
  assert.equal(created.body.summary.plannedCostUgx, 550000);
  assert.equal(created.body.summary.marketableKg, 1800);
  assert.equal(created.body.summary.plannedRevenueUgx, 2700000);
  assert.equal(created.body.summary.breakEvenPriceUgx, 306);
  assert.equal(created.body.summary.actualCostUgx, 180000);
  assert.equal(created.body.summary.hasUnrecordedActualCosts, true);
  const replay = await call("/api/seasons", farmer, "POST", input, key);
  assert.equal(replay.body.id, created.body.id);
  const updated = await call(
    `/api/seasons/${created.body.id}`,
    farmer,
    "PATCH",
    {
      version: 1,
      sales: [
        {
          id: "sale-1",
          date: "2026-07-01",
          quantityKg: 500,
          unitPriceUgx: 1500,
          buyer: "Sample buyer",
          receivedUgx: 500000,
        },
      ],
    },
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.summary.salesValueUgx, 750000);
  assert.equal(updated.body.summary.receivedUgx, 500000);
  assert.equal(updated.body.summary.recordedCashBalanceUgx, 320000);
  assert.equal(updated.body.costs.length, 2);
  assert.equal(updated.body.notes, input.notes);
  assert.equal(
    (
      await call(`/api/seasons/${created.body.id}`, farmer, "PATCH", {
        version: 1,
        status: "closed",
      })
    ).status,
    409,
  );
});
test("season validation rejects false finances, bad chronology and other farmer records", async () => {
  for (const update of [
    { expectedHarvestDate: "2026-01-01" },
    { reserveKg: 2100 },
    {
      sales: [
        {
          id: "s",
          date: "2026-07-01",
          quantityKg: 100,
          unitPriceUgx: 1000,
          buyer: "Buyer",
          receivedUgx: 100001,
        },
      ],
    },
    {
      sales: [
        {
          id: "s",
          date: "2026-07-01",
          quantityKg: 1600,
          unitPriceUgx: 1000,
          buyer: "Buyer",
          receivedUgx: 0,
        },
      ],
    },
    {
      costs: [
        {
          id: "c",
          category: "seed",
          label: "Invalid",
          plannedUgx: 1.5,
          actualUgx: null,
        },
      ],
    },
  ])
    assert.equal(
      (
        await call("/api/seasons", farmer, "POST", {
          ...seasonInput(),
          ...update,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await call("/api/seasons", farmer, "POST", {
        ...seasonInput(),
        farmId: "farm-peter-coffee",
      })
    ).status,
    404,
  );
  const other = await call("/api/seasons", operator, "POST", {
    ...seasonInput(),
    farmId: "farm-peter-coffee",
    crop: "Coffee",
  });
  assert.equal(other.status, 201);
  const mine = await call("/api/seasons", farmer);
  assert.equal(
    mine.body.some((item: any) => item.id === other.body.id),
    false,
  );
});
test("lot review is role protected, material edits invalidate review, season bounds preserved", async () => {
  const season = await call("/api/seasons", farmer, "POST", seasonInput());
  const lot = await newLot({ seasonId: season.body.id });
  assert.match(lot.lotCode, /^AG-/);
  assert.equal(lot.qualityReviewedBy, null);
  assert.equal(
    (
      await call(`/api/lots/${lot.id}`, farmer, "PATCH", {
        version: 1,
        qualityStatus: "accepted",
        qualityNotes: "I accepted my own sample.",
      })
    ).status,
    403,
  );
  const accepted = await acceptLot(lot.id, 1);
  assert.ok(accepted.qualityReviewedAt);
  const changed = await call(`/api/lots/${lot.id}`, farmer, "PATCH", {
    version: 2,
    quantityKg: 600,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.qualityStatus, "unassessed");
  assert.equal(changed.body.qualityReviewedBy, null);
  assert.equal(
    (
      await call(`/api/seasons/${season.body.id}`, farmer, "PATCH", {
        version: 1,
        harvestedKg: 100,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/lots", farmer, "POST", {
        ...lotInput(),
        seasonId: season.body.id,
        quantityKg: 1000,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/lots", farmer, "POST", {
        ...lotInput(),
        moisturePercent: 12,
        measurementMethod: "not_recorded",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/lots", farmer, "POST", {
        ...lotInput(),
        farmId: "farm-peter-coffee",
      })
    ).status,
    404,
  );
});
test("collections reserve whole accepted lots atomically, isolate farmers and freeze dispatched manifests", async () => {
  const lot = await acceptLot((await newLot()).id, 1);
  assert.equal(
    (await call("/api/collections", farmer, "POST", collectionInput([lot.id])))
      .status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/collections",
        operator,
        "POST",
        collectionInput([lot.id, lot.id]),
      )
    ).status,
    400,
  );
  const inputs = collectionInput([lot.id]);
  const concurrent = await Promise.all([
    call("/api/collections", operator, "POST", inputs),
    call("/api/collections", operator, "POST", inputs),
  ]);
  assert.deepEqual(
    concurrent.map((result) => result.status).sort(),
    [201, 409],
  );
  const collection = concurrent.find((result) => result.status === 201)!.body;
  assert.equal(collection.summary.allocatedKg, 500);
  assert.equal(collection.summary.contributorCount, 1);
  assert.equal(collection.summary.estimatedValueUgx, 750000);
  const lots = await call("/api/lots", farmer);
  const allocated = lots.body.find((item: any) => item.id === lot.id);
  assert.deepEqual(Object.keys(allocated.allocation).sort(), [
    "collectionId",
    "status",
  ]);
  assert.equal(
    (
      await call(`/api/lots/${lot.id}`, farmer, "PATCH", {
        version: 2,
        notes: "Changed",
      })
    ).body.error.code,
    "LOT_ALLOCATED",
  );
  const confirmed = await call(
    `/api/collections/${collection.id}`,
    operator,
    "PATCH",
    { version: 1, status: "confirmed" },
  );
  assert.equal(confirmed.status, 200);
  assert.equal(
    (
      await call(`/api/collections/${collection.id}`, operator, "PATCH", {
        version: 2,
        priceUgxPerKg: 1,
      })
    ).status,
    409,
  );
  const dispatched = await call(
    `/api/collections/${collection.id}`,
    operator,
    "PATCH",
    { version: 2, status: "dispatched" },
  );
  assert.equal(dispatched.status, 200);
  assert.equal(dispatched.body.manifest[0].lotCode, lot.lotCode);
  assert.equal(
    (
      await call(`/api/collections/${collection.id}`, operator, "PATCH", {
        version: 3,
        status: "cancelled",
      })
    ).body.error.code,
    "COLLECTION_FINAL",
  );
  assert.equal(
    (await call("/api/bootstrap", farmer)).body.collections.length,
    0,
  );
});
test("cancellation releases inventory while retaining snapshot and confirmation requires target supply", async () => {
  const lot = await acceptLot((await newLot()).id, 1);
  const created = await call("/api/collections", operator, "POST", {
    ...collectionInput([lot.id]),
    targetKg: 1000,
  });
  assert.equal(created.status, 201);
  assert.equal(
    (
      await call(`/api/collections/${created.body.id}`, operator, "PATCH", {
        version: 1,
        status: "confirmed",
      })
    ).status,
    400,
  );
  const cancelled = await call(
    `/api/collections/${created.body.id}`,
    operator,
    "PATCH",
    { version: 1, status: "cancelled" },
  );
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.summary.allocatedKg, 500);
  const changed = await call(`/api/lots/${lot.id}`, farmer, "PATCH", {
    version: 2,
    quantityKg: 300,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.allocation, null);
  const list = await call("/api/collections", operator);
  assert.equal(
    list.body.find((item: any) => item.id === created.body.id).summary
      .allocatedKg,
    500,
  );
  assert.equal(
    (
      await call(`/api/collections/${created.body.id}`, operator, "PATCH", {
        version: 2,
        status: "planning",
      })
    ).status,
    409,
  );
  const unreviewed = await newLot();
  assert.equal(
    (
      await call(
        "/api/collections",
        operator,
        "POST",
        collectionInput([unreviewed.id]),
      )
    ).status,
    400,
  );
});
