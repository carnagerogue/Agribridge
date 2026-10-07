import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  assertSchemaCurrent,
  migrate,
  openDatabase,
  type Database,
} from "../db.js";
import { loadConfig } from "../config.js";
import { MIGRATIONS } from "../migrations/index.js";
import { runMigrations } from "../migrations/runner.js";
import {
  RECORD_COLUMNS,
  RECORD_TABLES,
  RECORD_TYPES,
  insertRecord,
  selectRecords,
  type ColumnKind,
} from "../records.js";

/**
 * Uses in-process PGlite by default. Set TEST_DATABASE_URL to a PostgreSQL
 * server (a role that may create databases) to run the same checks with real
 * concurrent connections; each test gets its own temporary database.
 */
async function memory(): Promise<Database> {
  const server = process.env.TEST_DATABASE_URL;
  if (!server) return openDatabase({ databasePath: ":memory:" });
  const name = `agribridge_test_${randomUUID().replaceAll("-", "")}`;
  const admin = await openDatabase({ databaseUrl: server, databasePath: "" });
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(server);
  url.pathname = `/${name}`;
  const db = await openDatabase({
    databaseUrl: url.toString(),
    databasePath: "",
  });
  return {
    ...db,
    async close() {
      await db.close();
      await admin.query(`DROP DATABASE ${name}`);
      await admin.close();
    },
  };
}
async function withDatabase(work: (db: Database) => Promise<void>) {
  const db = await memory();
  try {
    await work(db);
  } finally {
    await db.close();
  }
}
const tableExists = async (db: Database, table: string) =>
  (
    await db.query<{ present: boolean }>(
      `SELECT to_regclass($1) IS NOT NULL AS present`,
      [table],
    )
  ).rows[0].present;
const isTable = async (db: Database, table: string) =>
  (
    await db.query<{ present: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=$1 AND table_type='BASE TABLE') AS present`,
      [table],
    )
  ).rows[0].present;
const ALL_VERSIONS = MIGRATIONS.map((migration) => migration.version);
const appliedVersions = async (db: Database) =>
  (
    await db.query<{ version: number }>(
      `SELECT version FROM schema_migrations ORDER BY version`,
    )
  ).rows.map((row) => row.version);

/** Creates the schema released before typed tables, with two organizations. */
async function legacyDatabase() {
  const db = await memory();
  await runMigrations(db, MIGRATIONS.slice(0, 1));
  await db.query(
    `INSERT INTO organizations(id,name) VALUES('org-a','A'),('org-b','B')`,
  );
  await db.query(
    `INSERT INTO users(id,tenant_id,name,role) VALUES('farmer-a','org-a','Farmer A','farmer'),('operator-a','org-a','Operator A','operator'),('farmer-b','org-b','Farmer B','farmer')`,
  );
  return db;
}
type Legacy = {
  type: string;
  id: string;
  owner?: string;
  tenant?: string;
  data: Record<string, unknown>;
  /** Expected API differences after migration; undefined removes a key. */
  expect?: Record<string, unknown>;
};
async function insertLegacy(db: Database, rows: Legacy[]) {
  for (const row of rows)
    await db.query(
      `INSERT INTO entities(id,type,tenant_id,owner_id,data,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5::jsonb,3,'2026-01-02T03:04:05.678Z','2026-02-03T04:05:06.789Z')`,
      [
        row.id,
        row.type,
        row.tenant || "org-a",
        row.owner || "farmer-a",
        JSON.stringify(row.data),
      ],
    );
}

const at = "2026-09-28T08:15:30.123Z";
const legacyRecords: Legacy[] = [
  {
    type: "farms",
    id: "farm-1",
    data: {
      name: "Hill plot",
      district: "Kiboga",
      latitude: 0.9,
      longitude: 31.7,
      areaAcres: 2.25,
      crop: "Coffee",
      plantedAt: "2024-03-15",
      ownerName: "Farmer A",
      stage: "growing",
      notes: "Terraced",
      sample: true,
    },
  },
  {
    type: "tasks",
    id: "task-callback",
    owner: "operator-a",
    data: {
      farmId: "",
      title: "Return a call",
      dueDate: "2026-09-29",
      category: "follow_up",
      status: "pending",
      notes: "",
      callbackRequestId: "callback-1",
    },
  },
  {
    type: "tasks",
    id: "task-farm",
    data: {
      farmId: "farm-1",
      title: "Prune",
      dueDate: "2026-10-01",
      category: "general",
      status: "completed",
      notes: "Done early",
    },
  },
  {
    type: "contacts",
    id: "contact-full",
    owner: "operator-a",
    data: {
      name: "Contact",
      phone: "+256700000011",
      district: "Kiboga",
      type: "farmer",
      crop: "Coffee",
      stage: "active",
      preferredChannel: "sms",
      consent: true,
      notes: "",
      consentChannels: ["sms"],
      consentRecordedAt: at,
      consentSource: "operator_attestation",
      consentWithdrawnAt: "2026-01-01T00:00:00.000Z",
      lastInboundAt: { sms: at },
    },
  },
  {
    type: "contacts",
    id: "contact-minimal",
    owner: "operator-a",
    data: {
      name: "Buyer",
      phone: "+256700000012",
      district: "Kampala",
      type: "buyer",
      crop: "Beans",
      stage: "new",
      preferredChannel: "whatsapp",
      consent: false,
      notes: "Older record without consent metadata",
    },
    expect: {
      consentChannels: [],
      consentRecordedAt: null,
      consentSource: null,
      lastInboundAt: {},
    },
  },
  {
    type: "market-prices",
    id: "price-1",
    owner: "operator-a",
    data: {
      crop: "Maize",
      market: "Kisenyi",
      district: "Kampala",
      priceUgx: 1450.5,
      unit: "kg",
      observedAt: at,
      source: "Sample",
      status: "sample",
      sample: true,
    },
  },
  {
    type: "offers",
    id: "offer-1",
    data: {
      crop: "Coffee",
      quantityKg: 12.5,
      priceUgx: 9000,
      district: "Kiboga",
      sellerName: "Farmer A",
      description: "",
      status: "reserved",
    },
  },
  {
    type: "deals",
    id: "deal-1",
    owner: "operator-a",
    data: {
      buyer: "Buyer",
      crop: "Coffee",
      quantityKg: 1000,
      priceUgx: 9500,
      destination: "Mombasa",
      incoterm: "FOB",
      stage: "qualified",
      checklist: ["Buyer due diligence", "Quality specification"],
      notes: "",
    },
  },
  {
    type: "reports",
    id: "report-plain",
    data: {
      kind: "crop_pest",
      district: "Kiboga",
      description: "Leaves are curling across the plot",
      status: "submitted",
    },
  },
  {
    type: "reports",
    id: "report-located",
    data: {
      kind: "standing_water",
      district: "Kiboga",
      farmId: "farm-1",
      description: "Water stands beside the path after rain",
      status: "reviewing",
      latitude: 0.91,
      longitude: 31.71,
    },
  },
  {
    type: "progress",
    id: "progress-1",
    data: { lessonId: "lesson-1", completed: true, score: 100 },
    expect: { lessonVersion: 1 },
  },
  {
    type: "settings",
    id: "settings-1",
    data: {
      language: "lg",
      lowDataMode: true,
      preferredChannel: "sms",
      notifications: false,
    },
  },
  {
    type: "messages",
    id: "message-1",
    owner: "operator-a",
    data: {
      contactId: "contact-full",
      channel: "sms",
      body: "Collection on Friday",
      status: "failed",
      dispatchState: "finished",
      providerId: "provider-1",
      error: "Rejected by carrier",
      retryable: false,
      deliveryUncertain: true,
      deliveryUpdatedAt: at,
    },
  },
  {
    type: "seasons",
    id: "season-1",
    data: {
      farmId: "farm-1",
      name: "2026 main",
      crop: "Coffee",
      areaAcres: 2.25,
      plantingDate: "2026-03-01",
      expectedHarvestDate: "2026-09-01",
      expectedHarvestKg: 900,
      reserveKg: 50,
      expectedPriceUgx: 8000,
      contingencyUgx: 999_999_999_999,
      status: "active",
      costs: [
        {
          id: "c1",
          category: "seed",
          label: "Seedlings",
          plannedUgx: 100000,
          actualUgx: null,
        },
      ],
      sales: [
        {
          id: "s1",
          date: "2026-09-05",
          quantityKg: 100,
          unitPriceUgx: 8200,
          buyer: "Buyer",
          receivedUgx: 500000,
        },
      ],
      harvestedKg: 700,
      notes: "",
    },
  },
  {
    type: "lots",
    id: "lot-1",
    data: {
      farmId: "farm-1",
      seasonId: "season-1",
      crop: "Coffee",
      harvestDate: "2026-09-02",
      quantityKg: 300.75,
      bagCount: 5,
      storageLocation: "Store A",
      moisturePercent: 13.5,
      measurementMethod: "meter",
      testReference: "M-1",
      qualityStatus: "accepted",
      qualityNotes: "Meter reading only",
      notes: "",
      lotCode: "AG-20260902-ABCDEF12",
      qualityReviewedBy: "Operator A",
      qualityReviewedAt: at,
    },
  },
  {
    type: "lots",
    id: "lot-2",
    data: {
      farmId: "farm-1",
      seasonId: "",
      crop: "Coffee",
      harvestDate: "2026-09-03",
      quantityKg: 10,
      bagCount: 1,
      storageLocation: "Store A",
      moisturePercent: null,
      measurementMethod: "not_recorded",
      testReference: "",
      qualityStatus: "unassessed",
      qualityNotes: "",
      notes: "",
      lotCode: "AG-20260903-ABCDEF13",
      qualityReviewedBy: null,
      qualityReviewedAt: null,
    },
    expect: { seasonId: undefined },
  },
  {
    type: "collections",
    id: "collection-1",
    owner: "operator-a",
    data: {
      name: "Coffee pickup",
      crop: "Coffee",
      buyer: "Buyer",
      dealId: "deal-1",
      targetKg: 300,
      priceUgxPerKg: 8500,
      collectionDate: "2026-10-10",
      meetingPoint: "Centre",
      destination: "Kampala",
      status: "confirmed",
      lotIds: ["lot-1"],
      notes: "",
      manifest: [
        {
          lotId: "lot-1",
          lotCode: "AG-20260902-ABCDEF12",
          quantityKg: 300.75,
          ownerId: "farmer-a",
          qualityStatus: "accepted",
          qualityReviewedBy: "Operator A",
          qualityReviewedAt: at,
          lotVersion: 3,
        },
      ],
    },
  },
];

test("a fresh database applies every migration once and records it", async () =>
  withDatabase(async (db) => {
    assert.deepEqual(await migrate(db), ALL_VERSIONS);
    assert.deepEqual(await migrate(db), []);
    assert.deepEqual(await appliedVersions(db), ALL_VERSIONS);
    assert.equal(await isTable(db, "entities"), false);
    await assertSchemaCurrent(db);
  }));

test("a release from before versioned migrations cannot start on the upgraded schema", async () =>
  withDatabase(async (db) => {
    await migrate(db);
    // The earlier release ran exactly the baseline statements, untracked.
    await assert.rejects(
      db.transaction(async (tx) => {
        for (const statement of MIGRATIONS[0].statements)
          await tx.query(statement);
      }),
      /cannot create index/,
    );
  }));

test("concurrent startups apply each migration exactly once", async () =>
  withDatabase(async (db) => {
    const results = await Promise.all([migrate(db), migrate(db), migrate(db)]);
    assert.deepEqual(
      results.flat().sort((a, b) => a - b),
      ALL_VERSIONS,
    );
    assert.deepEqual(await appliedVersions(db), ALL_VERSIONS);
  }));

test("the record registry matches the migrated schema exactly", async () =>
  withDatabase(async (db) => {
    await migrate(db);
    const sqlType: Record<ColumnKind, string> = {
      text: "text",
      integer: "integer",
      bigint: "bigint",
      float: "double precision",
      boolean: "boolean",
      date: "date",
      timestamptz: "timestamp with time zone",
      jsonb: "jsonb",
      "text[]": "ARRAY",
    };
    for (const type of RECORD_TYPES) {
      const { table, fields } = RECORD_TABLES[type];
      const { rows } = await db.query<{
        column_name: string;
        data_type: string;
      }>(
        `SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1`,
        [table],
      );
      const actual = Object.fromEntries(
        rows.map((row) => [row.column_name, row.data_type]),
      );
      const expected: Record<string, string> = {
        id: "text",
        tenant_id: "text",
        owner_id: "text",
        version: "integer",
        sample: "boolean",
        created_at: "timestamp with time zone",
        updated_at: "timestamp with time zone",
      };
      assert.deepEqual(Object.keys(expected), [...RECORD_COLUMNS]);
      for (const { column, kind } of Object.values(fields))
        expected[column] = sqlType[kind];
      assert.deepEqual(actual, expected, `${type} schema drifted`);
    }
  }));

test("legacy JSON records upgrade into typed tables without losing values", async () => {
  const db = await legacyDatabase();
  try {
    await insertLegacy(db, legacyRecords);
    await db.query(
      `INSERT INTO lot_allocations(tenant_id,lot_id,collection_id) VALUES('org-a','lot-1','collection-1')`,
    );
    assert.deepEqual(await migrate(db), ALL_VERSIONS.slice(1));
    assert.equal(await isTable(db, "entities"), false);
    for (const legacy of legacyRecords) {
      const [row] = await selectRecords(db, legacy.type, "id=$1", [legacy.id]);
      assert.ok(row, `${legacy.type} ${legacy.id} was not copied`);
      const expected: Record<string, unknown> = {
        ...legacy.data,
        ...legacy.expect,
      };
      for (const [key, value] of Object.entries(expected))
        if (value === undefined) delete expected[key];
      assert.deepEqual(row.data, expected, `${legacy.type} ${legacy.id}`);
      assert.equal(row.version, 3);
      assert.equal(row.tenant_id, "org-a");
      assert.equal(
        new Date(row.created_at).toISOString(),
        "2026-01-02T03:04:05.678Z",
      );
      assert.equal(
        new Date(row.updated_at).toISOString(),
        "2026-02-03T04:05:06.789Z",
      );
    }
    const allocations = await db.query(
      `SELECT lot_id,collection_id FROM lot_allocations`,
    );
    assert.deepEqual(allocations.rows, [
      { lot_id: "lot-1", collection_id: "collection-1" },
    ]);
  } finally {
    await db.close();
  }
});

test("an unmapped legacy field stops the upgrade and changes nothing", async () => {
  const db = await legacyDatabase();
  try {
    await insertLegacy(db, [
      legacyRecords[0],
      {
        type: "offers",
        id: "offer-extra",
        data: {
          ...legacyRecords.find((item) => item.type === "offers")!.data,
          paymentReference: "kept-by-a-newer-feature",
        },
      },
    ]);
    await assert.rejects(
      migrate(db),
      /unmapped legacy field "offers\.paymentReference"/,
    );
    assert.deepEqual(await appliedVersions(db), [1]);
    assert.equal(await tableExists(db, "farms"), false);
    const { rows } = await db.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM entities`,
    );
    assert.equal(rows[0].count, 2);
  } finally {
    await db.close();
  }
});

test("an unknown legacy record type stops the upgrade", async () => {
  const db = await legacyDatabase();
  try {
    await insertLegacy(db, [{ type: "payments", id: "payment-1", data: {} }]);
    await assert.rejects(migrate(db), /unmapped legacy record type "payments"/);
    assert.deepEqual(await appliedVersions(db), [1]);
  } finally {
    await db.close();
  }
});

test("malformed legacy values are rejected rather than coerced", async () => {
  const db = await legacyDatabase();
  try {
    await insertLegacy(db, [
      {
        type: "farms",
        id: "farm-bad",
        data: { ...legacyRecords[0].data, stage: "unknown-stage" },
      },
    ]);
    await assert.rejects(migrate(db), /check constraint/);
    assert.deepEqual(await appliedVersions(db), [1]);
    assert.equal(await isTable(db, "entities"), true);
  } finally {
    await db.close();
  }
});

test("the database rejects references across organizations", async () =>
  withDatabase(async (db) => {
    await migrate(db);
    await db.query(
      `INSERT INTO organizations(id,name) VALUES('org-a','A'),('org-b','B')`,
    );
    await db.query(
      `INSERT INTO users(id,tenant_id,name,role) VALUES('farmer-a','org-a','A','farmer'),('farmer-b','org-b','B','farmer')`,
    );
    const farm = await insertRecord(db, "farms", {
      tenantId: "org-a",
      ownerId: "farmer-a",
      data: legacyRecords[0].data,
    });
    const task = {
      title: "Cross-tenant",
      dueDate: "2026-10-01",
      category: "general",
      status: "pending",
      notes: "",
    };
    await assert.rejects(
      insertRecord(db, "tasks", {
        tenantId: "org-b",
        ownerId: "farmer-b",
        data: { ...task, farmId: farm!.id },
      }),
      /foreign key/,
    );
    const own = await insertRecord(db, "tasks", {
      tenantId: "org-a",
      ownerId: "farmer-a",
      data: { ...task, farmId: farm!.id },
    });
    assert.equal(own!.data.farmId, farm!.id);
    const unlinked = await insertRecord(db, "tasks", {
      tenantId: "org-b",
      ownerId: "farmer-b",
      data: { ...task, farmId: "" },
    });
    assert.equal(unlinked!.data.farmId, "");
  }));

test("writing a field without a column fails loudly", async () =>
  withDatabase(async (db) => {
    await migrate(db);
    await assert.rejects(
      insertRecord(db, "settings", {
        tenantId: "org-a",
        ownerId: "farmer-a",
        data: { language: "en", theme: "dark" },
      }),
      /settings\.theme has no column/,
    );
  }));

test("an edited applied migration is refused", async () =>
  withDatabase(async (db) => {
    await migrate(db);
    await db.query(
      `UPDATE schema_migrations SET checksum='edited' WHERE version=1`,
    );
    await assert.rejects(migrate(db), /must never be edited/);
  }));

test("an older release refuses a newer database schema", async () =>
  withDatabase(async (db) => {
    await migrate(db);
    await db.query(
      `INSERT INTO schema_migrations(version,name,checksum) VALUES($1,'from_the_future','x')`,
      [MIGRATIONS.length + 1],
    );
    await assert.rejects(migrate(db), /newer than this release/);
    await assert.rejects(assertSchemaCurrent(db), /newer than this release/);
  }));

test("verification without migration reports pending work and creates nothing", async () =>
  withDatabase(async (db) => {
    await assert.rejects(
      assertSchemaCurrent(db),
      new RegExp(
        `schema is at version 0; this release needs ${MIGRATIONS.length}`,
      ),
    );
    assert.equal(await tableExists(db, "schema_migrations"), false);
    await runMigrations(db, MIGRATIONS.slice(0, 1));
    await assert.rejects(assertSchemaCurrent(db), /version 1; this release/);
  }));

test("migration lists must be contiguous and well formed", async () =>
  withDatabase(async (db) => {
    await assert.rejects(
      runMigrations(db, [MIGRATIONS[1]]),
      /contiguous from 1/,
    );
    await assert.rejects(
      runMigrations(db, [{ version: 1, name: "Bad Name", statements: [] }]),
      /malformed/,
    );
  }));

test("startup migration mode is explicit", () => {
  assert.equal(loadConfig({}).databaseMigrations, "auto");
  assert.equal(
    loadConfig({ DATABASE_MIGRATIONS: "verify" }).databaseMigrations,
    "verify",
  );
  assert.throws(
    () => loadConfig({ DATABASE_MIGRATIONS: "skip" }),
    /DATABASE_MIGRATIONS/,
  );
});
