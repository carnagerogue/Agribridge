import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, migrate, type Database } from "../db.js";
import {
  createMarketDataService,
  MARKET_SOURCE,
  parseWfpCsv,
} from "../market-data.js";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { seedDemo } from "../seed.js";

const NOW = new Date("2026-09-29T04:00:00Z");
const headers =
  "date,admin1,admin2,market,market_id,latitude,longitude,category,commodity,commodity_id,unit,priceflag,pricetype,currency,price,usdprice";
function line(overrides: Record<string, string> = {}) {
  const row = {
    date: "2026-08-15",
    admin1: "Adjumani",
    admin2: "Adjumani",
    market: "Adjumani (refugee settlement)",
    market_id: "6416",
    latitude: "3.34",
    longitude: "31.78",
    category: "pulses and nuts",
    commodity: "Beans",
    commodity_id: "50",
    unit: "KG",
    priceflag: "actual",
    pricetype: "Retail",
    currency: "UGX",
    price: "4767",
    usdprice: "1.28",
    ...overrides,
  };
  return headers
    .split(",")
    .map((key) => {
      const value = row[key as keyof typeof row];
      return /[",\r\n]/.test(value)
        ? `"${value.replaceAll('"', '""')}"`
        : value;
    })
    .join(",");
}
const CSV = [
  headers,
  line({ date: "2026-07-15", price: "4500" }),
  line(),
  line({ pricetype: "Wholesale", date: "2022-05-15", price: "2300" }),
  line({
    market: "Owino",
    market_id: "258",
    admin1: "Kampala",
    admin2: "Central Kampala",
    date: "2026-04-15",
    price: "4514",
  }),
  line({
    commodity: "Cooking oil",
    commodity_id: "64",
    category: "oil and fats",
    unit: "L",
    price: "9500",
  }),
  line({
    commodity: "Soap",
    commodity_id: "900",
    category: "non-food",
    unit: "Unit",
    price: "1200",
  }),
].join("\n");
const FULL_CSV =
  CSV +
  "\n" +
  Array.from({ length: 60 }, (_, index) =>
    line({
      date: "2020-01-15",
      market: `Fixture market ${Math.floor(index / 10)}`,
      market_id: String(8000 + Math.floor(index / 10)),
      commodity: `Fixture commodity ${index % 10}`,
      commodity_id: String(8000 + (index % 10)),
      category: "vegetables and fruits",
    }),
  ).join("\n");
const metadata = () => ({
  success: true,
  result: {
    license_id: "cc-by-igo",
    license_url: "http://creativecommons.org/licenses/by/3.0/igo/legalcode",
    organization: { name: "wfp" },
    resources: [
      {
        id: "e082d683-cad5-4dcd-bf54-db76ae254d33",
        url: MARKET_SOURCE.downloadUrl,
        last_modified: "2026-09-27T20:10:56.443347",
      },
    ],
  },
});
function mockSource(csv = FULL_CSV) {
  let calls = 0;
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input, options) => {
    calls++;
    requested.push(String(input));
    assert.ok(options?.signal);
    if (String(input) === MARKET_SOURCE.metadataUrl)
      return Response.json(metadata());
    assert.equal(String(input), MARKET_SOURCE.downloadUrl);
    return new Response(csv, { headers: { "content-type": "text/csv" } });
  };
  return {
    fetchImpl,
    get calls() {
      return calls;
    },
    requested,
  };
}
async function withDb(work: (db: Database) => Promise<void>) {
  const db = await openDatabase({ databasePath: ":memory:" });
  try {
    await migrate(db);
    await work(db);
  } finally {
    await db.close();
  }
}

test("WFP normalization preserves exact units, monthly dates, price types, raw fields and deterministic latest series", () => {
  const parsed = parseWfpCsv(
    `\uFEFF${headers}\n#date,#adm1,#adm2,#market,#id,#lat,#lon,#category,#commodity,#id,#unit,#flag,#type,#currency,#price,#usd\n${CSV.split("\n").slice(1).join("\n")}`,
    NOW,
  );
  assert.equal(parsed.recordCount, 6);
  assert.equal(parsed.seriesCount, 5);
  assert.equal(parsed.marketCount, 2);
  assert.equal(parsed.commodityCount, 3);
  const retail = parsed.observations.find(
    (row) =>
      row.data.commodity === "Beans" &&
      row.data.marketId === "6416" &&
      row.data.priceType === "Retail",
  )!;
  assert.equal(retail.data.price, 4767);
  assert.equal(retail.data.observedAt, "2026-08-15");
  assert.equal(retail.data.period, "2026-08");
  assert.equal(retail.raw.price, "4767");
  assert.equal(retail.data.rowHash.length, 64);
  const wholesale = parsed.observations.find(
    (row) => row.data.priceType === "Wholesale",
  )!;
  assert.equal(wholesale.data.observedAt, "2022-05-15");
  assert.equal(
    parsed.observations.find((row) => row.data.commodity === "Cooking oil")!
      .data.unit,
    "L",
  );
  assert.equal(
    parsed.observations.find((row) => row.data.commodity === "Soap")!.data.unit,
    "Unit",
  );
  const quoted = parseWfpCsv(
    `${headers}\n${line({ market: 'Market, "North"', latitude: "", longitude: "", usdprice: "" })}`,
    NOW,
  );
  assert.equal(quoted.observations[0].data.market, 'Market, "North"');
  assert.equal(quoted.observations[0].data.latitude, null);
  assert.equal(parseWfpCsv(CSV, NOW).observations[0].data.id, retail.data.id);
});

test("future dates, conflicting observations, negative prices and broken CSV fail closed", () => {
  for (const csv of [
    `${headers}\n${line({ date: "2030-01-15" })}`,
    `${headers}\n${line({ price: "-1" })}`,
    `${headers}\n${line({ date: "2026-02-31" })}`,
    `${headers}\n${line()}\n${line({ price: "100" })}`,
    `${headers}\n"unterminated`,
    `${headers}\nshort,row`,
  ])
    assert.throws(() => parseWfpCsv(csv, NOW));
  assert.throws(
    () => parseWfpCsv("X".repeat(8 * 1024 * 1024 + 1), NOW),
    /size limit/,
  );
});

test("real-source snapshot has provenance, observation freshness, exact filtering and stable pagination", async () =>
  withDb(async (db) => {
    const source = mockSource();
    const service = createMarketDataService(db, {
      fetchImpl: source.fetchImpl,
      now: () => NOW,
    });
    const first = await service.read({ limit: 2 });
    assert.equal(first.status, "available");
    assert.equal(first.cacheStatus, "fresh");
    assert.equal(first.source.recordCount, 66);
    assert.equal(first.source.seriesCount, 65);
    assert.equal(first.source.marketCount, 8);
    assert.equal(first.source.sourceUpdatedAt, "2026-09-27T20:10:56.443Z");
    assert.equal(first.source.latestObservationAt, "2026-08-15");
    assert.equal(first.source.frequency, "monthly");
    assert.equal(first.source.license.url, MARKET_SOURCE.license.url);
    assert.ok(first.nextCursor);
    const second = await service.read({ limit: 2, cursor: first.nextCursor! });
    assert.equal(
      second.items.some((item) =>
        first.items.some((previous) => previous.id === item.id),
      ),
      false,
    );
    assert.equal(source.calls, 2);
    const historical = await service.read({ priceType: "Wholesale" });
    assert.equal(historical.total, 1);
    assert.equal(historical.items[0].freshness, "historical");
    assert.equal(historical.items[0].observedAt, "2022-05-15");
    const litre = await service.read({ unit: "L" });
    assert.equal(litre.total, 1);
    assert.equal(litre.items[0].price, 9500);
    const household = await service.read({ category: "non-food" });
    assert.equal(household.items[0].commodity, "Soap");
    assert.ok(first.filters.categories.includes("non-food"));
    await assert.rejects(() => service.read({ limit: 101 }));
    await assert.rejects(() => service.read({ url: "http://127.0.0.1" }));
    await assert.rejects(() => service.read({ cursor: "garbage" }), /invalid/);
    const raw = await db.query<any>(
      `SELECT raw_fields,row_hash FROM market_observations WHERE data->>'commodity'='Cooking oil'`,
    );
    assert.equal(raw.rows[0].raw_fields.unit, "L");
    assert.equal(raw.rows[0].row_hash.length, 64);
    const audit = await db.query<any>(
      `SELECT status,source_hash,record_count FROM market_data_imports`,
    );
    assert.equal(audit.rows[0].status, "succeeded");
    assert.equal(audit.rows[0].source_hash, first.source.sourceHash);
  }));

test("refresh failure retains durable observations and exponential backoff survives service instances", async () =>
  withDb(async (db) => {
    let clock = NOW;
    const good = mockSource();
    const service = createMarketDataService(db, {
      fetchImpl: good.fetchImpl,
      now: () => clock,
    });
    const first = await service.read({});
    clock = new Date(NOW.getTime() + 86_400_001);
    let failedCalls = 0;
    const failing: typeof fetch = async () => {
      failedCalls++;
      throw new Error("Secret-bearing private failure must not escape");
    };
    const broken = createMarketDataService(db, {
      fetchImpl: failing,
      now: () => clock,
    });
    await broken.refresh();
    const cached = await broken.read({});
    assert.equal(cached.status, "available");
    assert.equal(cached.cacheStatus, "stale");
    assert.equal(cached.refreshState, "backoff");
    assert.equal(cached.source.sourceHash, first.source.sourceHash);
    assert.equal(cached.source.retrievedAt, first.source.retrievedAt);
    assert.equal(cached.source.lastError?.includes("Secret-bearing"), false);
    await createMarketDataService(db, {
      fetchImpl: failing,
      now: () => clock,
    }).refresh(true);
    assert.equal(failedCalls, 1);
    clock = new Date(clock.getTime() + 60_001);
    await broken.refresh();
    assert.equal(failedCalls, 2);
    const state = await broken.read({});
    assert.equal(
      Date.parse(state.source.nextRefreshAt!) - clock.getTime(),
      120_000,
    );
  }));

test("truncated cold imports and regressed or collapsed refreshes cannot replace a trustworthy snapshot", async () => {
  await withDb(async (db) => {
    const cold = await createMarketDataService(db, {
      fetchImpl: mockSource(`${headers}\n${line()}`).fetchImpl,
      now: () => NOW,
    }).read({});
    assert.equal(cold.status, "unavailable");
    assert.match(cold.source.lastError!, /coverage/);
  });
  const lowerCoverage = [
    ...FULL_CSV.split("\n").slice(0, 7),
    ...FULL_CSV.split("\n").slice(7, 57),
  ].join("\n");
  const attacks = [
    `${headers}\n${line({ date: "2006-01-15" })}`,
    FULL_CSV.replaceAll("2026-08-15", "2025-08-15"),
    FULL_CSV.replace("2026-04-15", "2025-04-15"),
    lowerCoverage,
  ];
  for (const csv of attacks)
    await withDb(async (db) => {
      const first = await createMarketDataService(db, {
        fetchImpl: mockSource().fetchImpl,
        now: () => NOW,
      }).read({});
      const changed = createMarketDataService(db, {
        fetchImpl: mockSource(csv).fetchImpl,
        now: () => new Date(NOW.getTime() + 86_400_001),
      });
      await changed.refresh();
      const last = await changed.read({});
      // A ten-series reduction is below the 20% threshold and is intentionally allowed.
      if (csv === lowerCoverage) {
        assert.equal(last.source.seriesCount, 55);
        return;
      }
      assert.equal(last.source.sourceHash, first.source.sourceHash);
      assert.equal(last.source.seriesCount, 65);
      assert.equal(last.cacheStatus, "stale");
      assert.match(last.source.lastError!, /review is required/);
    });
  await withDb(async (db) => {
    // Keep above the absolute cold-start floor while collapsing >20% of prior coverage.
    const larger =
      FULL_CSV +
      "\n" +
      Array.from({ length: 30 }, (_, index) =>
        line({
          market: `Extra fixture ${index}`,
          market_id: String(9000 + index),
        }),
      ).join("\n");
    const first = await createMarketDataService(db, {
      fetchImpl: mockSource(larger).fetchImpl,
      now: () => NOW,
    }).read({});
    const next = createMarketDataService(db, {
      fetchImpl: mockSource().fetchImpl,
      now: () => new Date(NOW.getTime() + 86_400_001),
    });
    await next.refresh();
    assert.equal(
      (await next.read({})).source.sourceHash,
      first.source.sourceHash,
    );
  });
  await withDb(async (db) => {
    const first = await createMarketDataService(db, {
      fetchImpl: mockSource().fetchImpl,
      now: () => NOW,
    }).read({});
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input) === MARKET_SOURCE.metadataUrl) {
        const value = metadata();
        value.result.resources[0].last_modified = "2026-08-01T00:00:00";
        return Response.json(value);
      }
      return new Response(FULL_CSV);
    };
    const next = createMarketDataService(db, {
      fetchImpl,
      now: () => new Date(NOW.getTime() + 86_400_001),
    });
    await next.refresh();
    assert.equal(
      (await next.read({})).source.sourceHash,
      first.source.sourceHash,
    );
  });
});

test("concurrent service instances share a durable lease without holding database locks during download", async () =>
  withDb(async (db) => {
    let release!: () => void, started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    let calls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      calls++;
      if (String(input) === MARKET_SOURCE.metadataUrl) {
        started();
        await waiting;
        return Response.json(metadata());
      }
      return new Response(FULL_CSV);
    };
    const first = createMarketDataService(db, { fetchImpl, now: () => NOW });
    const pending = first.read({});
    await began;
    const second = await createMarketDataService(db, {
      fetchImpl,
      now: () => NOW,
    }).read({});
    assert.equal(second.status, "unavailable");
    assert.equal(second.refreshState, "running");
    assert.equal(calls, 1);
    await db.query(`SELECT 1`);
    release();
    assert.equal((await pending).status, "available");
    assert.equal(calls, 2);
  }));

test("only the exact HDX S3 object may redirect; metadata license and oversized downloads are rejected", async () => {
  for (const attack of [
    "http://127.0.0.1/private",
    "https://s3.us-east-1.amazonaws.com/other-bucket/private",
  ])
    await withDb(async (db) => {
      let requests = 0;
      const fetchImpl: typeof fetch = async (input) => {
        requests++;
        return String(input) === MARKET_SOURCE.metadataUrl
          ? Response.json(metadata())
          : new Response("", { status: 302, headers: { location: attack } });
      };
      const result = await createMarketDataService(db, {
        fetchImpl,
        now: () => NOW,
      }).read({});
      assert.equal(result.status, "unavailable");
      assert.equal(requests, 2);
    });
  await withDb(async (db) => {
    const fetchImpl: typeof fetch = async (input) =>
      String(input) === MARKET_SOURCE.metadataUrl
        ? Response.json({
            ...metadata(),
            result: { ...metadata().result, license_id: "unlicensed" },
          })
        : new Response(CSV);
    assert.equal(
      (
        await createMarketDataService(db, { fetchImpl, now: () => NOW }).read(
          {},
        )
      ).status,
      "unavailable",
    );
  });
  await withDb(async (db) => {
    const fetchImpl: typeof fetch = async (input) =>
      String(input) === MARKET_SOURCE.metadataUrl
        ? Response.json(metadata())
        : new Response("small body", {
            headers: { "content-length": "99999999" },
          });
    assert.equal(
      (
        await createMarketDataService(db, { fetchImpl, now: () => NOW }).read(
          {},
        )
      ).status,
      "unavailable",
    );
  });
  await withDb(async (db) => {
    let calls = 0;
    const fetchImpl: typeof fetch = async (input) => {
      calls++;
      if (String(input) === MARKET_SOURCE.metadataUrl)
        return Response.json(metadata());
      if (String(input) === MARKET_SOURCE.downloadUrl)
        return new Response("", {
          status: 302,
          headers: {
            location:
              "https://s3.us-east-1.amazonaws.com/hdx-production-filestore/resources/e082d683-cad5-4dcd-bf54-db76ae254d33/wfp_food_prices_uga.csv?temporary=public-download",
          },
        });
      return new Response(FULL_CSV);
    };
    const result = await createMarketDataService(db, {
      fetchImpl,
      now: () => NOW,
    }).read({});
    assert.equal(result.status, "available");
    assert.equal(calls, 3);
    assert.equal(JSON.stringify(result).includes("temporary="), false);
  });
});

test("snapshot remains available after disk restart and old pagination is rejected after changed import", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agribridge-markets-"));
  const databasePath = path.join(directory, "db");
  let db: Database | undefined;
  try {
    db = await openDatabase({ databasePath });
    await migrate(db);
    const initial = createMarketDataService(db, {
      fetchImpl: mockSource().fetchImpl,
      now: () => NOW,
    });
    const first = await initial.read({ limit: 1 });
    await db.close();
    db = await openDatabase({ databasePath });
    await migrate(db);
    const cached = createMarketDataService(db, {
      fetchImpl: async () => {
        throw new Error("Must not fetch fresh disk cache");
      },
      now: () => NOW,
    });
    assert.equal(
      (await cached.read({})).source.sourceHash,
      first.source.sourceHash,
    );
    const changed = createMarketDataService(db, {
      fetchImpl: mockSource(FULL_CSV.replace("4767", "4700")).fetchImpl,
      now: () => new Date(NOW.getTime() + 86_400_001),
    });
    await changed.refresh();
    await assert.rejects(
      () => changed.read({ cursor: first.nextCursor! }),
      /Start from the first page/,
    );
  } finally {
    await db?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("market-data routes require a session, admin refresh and CSRF; tenant sample prices stay separate", async () =>
  withDb(async (db) => {
    await seedDemo(db);
    const source = mockSource();
    const app = createApp(
      db,
      loadConfig({ AGRIBRIDGE_DEMO: "true" }),
      {},
      { marketFetch: source.fetchImpl },
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    try {
      const request = async (
        route: string,
        method = "GET",
        body?: unknown,
        headers: Record<string, string> = {},
      ) =>
        fetch(`${url}${route}`, {
          method,
          headers: { "content-type": "application/json", ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      assert.equal((await request("/api/market-data")).status, 401);
      const session = await request("/api/auth/demo", "POST", {
        role: "farmer",
      });
      const identity = (await session.json()) as any;
      const headers = {
        cookie: session.headers.get("set-cookie")!.split(";")[0],
        "x-csrf-token": identity.csrfToken,
      };
      const result = await request(
        "/api/market-data?commodity=Beans",
        "GET",
        undefined,
        headers,
      );
      assert.equal(result.status, 200);
      const data = (await result.json()) as any;
      assert.equal(
        data.items.every((item: any) => item.commodity === "Beans"),
        true,
      );
      assert.equal(JSON.stringify(data).includes("Sample"), false);
      assert.equal(
        (await request("/api/market-data/refresh", "POST", {}, headers)).status,
        403,
      );
      const admin = await request("/api/auth/demo", "POST", { role: "admin" });
      const adminIdentity = (await admin.json()) as any;
      const adminHeaders = {
        cookie: admin.headers.get("set-cookie")!.split(";")[0],
        "x-csrf-token": adminIdentity.csrfToken,
      };
      assert.equal(
        (
          await request(
            "/api/market-data/refresh",
            "POST",
            {},
            { cookie: adminHeaders.cookie },
          )
        ).status,
        403,
      );
      assert.equal(
        (await request("/api/market-data/refresh", "POST", {}, adminHeaders))
          .status,
        200,
      );
      assert.equal(source.calls, 2);
      const bootstrap = (await (
        await request("/api/bootstrap", "GET", undefined, headers)
      ).json()) as any;
      assert.equal(
        bootstrap.marketPrices.every((item: any) => item.sample),
        true,
      );
      assert.equal(bootstrap.marketData, undefined);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }));
