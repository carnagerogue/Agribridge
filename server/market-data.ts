import { createHash, randomUUID } from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import type { Database } from "./db.js";
import { ApiError, type AuthRequest, type User } from "./security.js";
import { audit } from "./store.js";
import { ugandaCalendarDay } from "./workflows.js";

export const MARKET_SOURCE = {
  id: "wfp-uganda-food-prices",
  title: "Uganda — WFP Food Prices",
  publisher: "World Food Programme (WFP), via HDX",
  datasetUrl: "https://data.humdata.org/dataset/wfp-food-prices-for-uganda",
  metadataUrl:
    "https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-uganda",
  downloadUrl:
    "https://data.humdata.org/dataset/883929b1-521e-4834-97f5-0ccc2df75b89/resource/e082d683-cad5-4dcd-bf54-db76ae254d33/download/wfp_food_prices_uga.csv",
  license: {
    name: "Creative Commons Attribution for Intergovernmental Organisations 3.0 (CC BY-IGO 3.0)",
    url: "https://creativecommons.org/licenses/by/3.0/igo/",
  },
  frequency: "monthly" as const,
};
const RESOURCE_ID = "e082d683-cad5-4dcd-bf54-db76ae254d33";
const DAY = 86_400_000;
const TTL = DAY;
const MAX_CSV = 8 * 1024 * 1024;
class SourceReviewRequired extends Error {}
const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
type Observation = {
  id: string;
  commodity: string;
  commodityId: string;
  category: string;
  market: string;
  marketId: string;
  admin1: string;
  admin2: string;
  latitude: number | null;
  longitude: number | null;
  observedAt: string;
  period: string;
  unit: string;
  currency: string;
  priceType: string;
  priceFlag: string;
  price: number;
  usdPrice: number | null;
  rowHash: string;
};
type ParsedObservation = { data: Observation; raw: Record<string, string> };
type SourceRow = {
  id: string;
  generation_id: string | null;
  source_hash: string | null;
  metadata: Record<string, any>;
  last_success_at: Date | string | null;
  last_attempt_at: Date | string | null;
  next_refresh_at: Date | string | null;
  lease_until: Date | string | null;
  lease_token: string | null;
  failure_count: number;
  last_error: string | null;
};
const iso = (value: Date | string | null) =>
  value ? new Date(value).toISOString() : null;

/** RFC 4180-style reader with strict resource limits, BOM and optional HXL support. */
function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false,
    closed = false;
  const push = () => {
    if (field.length > 4096 || row.length >= 64)
      throw new Error("Source CSV limits exceeded.");
    row.push(field);
    field = "";
    closed = false;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += char;
      continue;
    }
    if (char === '"') {
      if (field || closed) throw new Error("Malformed source CSV.");
      quoted = true;
    } else if (char === ",") push();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      push();
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      if (rows.length > 150_000)
        throw new Error("Source CSV row limit exceeded.");
    } else {
      if (closed) throw new Error("Malformed source CSV.");
      field += char;
    }
  }
  if (quoted) throw new Error("Incomplete source CSV.");
  if (field || row.length || closed) {
    push();
    if (row.some((value) => value.length)) rows.push(row);
  }
  return rows;
}
export function parseWfpCsv(text: string, now = new Date()) {
  if (Buffer.byteLength(text) > MAX_CSV)
    throw new Error("Source CSV size limit exceeded.");
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  const headers = rows.shift()?.map((value) => value.trim().toLowerCase());
  const required = [
    "date",
    "admin1",
    "admin2",
    "market",
    "market_id",
    "latitude",
    "longitude",
    "category",
    "commodity",
    "commodity_id",
    "unit",
    "priceflag",
    "pricetype",
    "currency",
    "price",
    "usdprice",
  ];
  if (
    !headers ||
    new Set(headers).size !== headers.length ||
    required.some((field) => !headers.includes(field))
  )
    throw new Error("Source CSV schema changed.");
  const latest = new Map<string, ParsedObservation>();
  let recordCount = 0;
  const today = ugandaCalendarDay(now);
  for (const cells of rows) {
    if (cells[0]?.startsWith("#")) continue;
    if (cells.length !== headers.length)
      throw new Error("Source CSV columns are incomplete.");
    const raw = Object.fromEntries(
      headers.map((key, index) => [key, cells[index]]),
    );
    recordCount++;
    const str = (key: string, optional = false) => {
      const value = raw[key]?.trim();
      if (
        (!optional && !value) ||
        value.length > 200 ||
        /[\u0000-\u001f\u007f]/.test(value)
      )
        throw new Error("Source contains invalid text fields.");
      return value;
    };
    const number = (key: string, optional = false) => {
      const value = raw[key]?.trim();
      if (optional && !value) return null;
      if (!value || !/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value))
        throw new Error("Source contains invalid numeric fields.");
      const parsed = Number(value);
      if (!Number.isFinite(parsed))
        throw new Error("Source contains invalid numeric fields.");
      return parsed;
    };
    const observedAt = str("date");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(observedAt) ||
      Number.isNaN(Date.parse(observedAt)) ||
      new Date(observedAt).toISOString().slice(0, 10) !== observedAt ||
      observedAt > today
    )
      throw new Error("Source contains an invalid or future observation date.");
    const price = number("price")!;
    const usdPrice = number("usdprice", true);
    const latitude = number("latitude", true);
    const longitude = number("longitude", true);
    if (
      price <= 0 ||
      price > 1e12 ||
      (usdPrice !== null && (usdPrice < 0 || usdPrice > 1e12)) ||
      (latitude !== null && Math.abs(latitude) > 90) ||
      (longitude !== null && Math.abs(longitude) > 180)
    )
      throw new Error("Source numeric values exceed supported bounds.");
    const marketId = str("market_id"),
      commodityId = str("commodity_id"),
      unit = str("unit"),
      priceType = str("pricetype"),
      priceFlag = str("priceflag"),
      currency = str("currency");
    const id = digest(
      JSON.stringify([
        marketId,
        commodityId,
        unit,
        priceType,
        priceFlag,
        currency,
      ]),
    );
    const rowHash = digest(JSON.stringify(raw));
    const data: Observation = {
      id,
      marketId,
      commodityId,
      market: str("market"),
      commodity: str("commodity"),
      category: str("category", true),
      admin1: str("admin1", true),
      admin2: str("admin2", true),
      latitude,
      longitude,
      observedAt,
      period: observedAt.slice(0, 7),
      unit,
      priceType,
      priceFlag,
      currency,
      price,
      usdPrice,
      rowHash,
    };
    const old = latest.get(id);
    if (old?.data.observedAt === observedAt && old.data.rowHash !== rowHash)
      throw new Error(
        "Source has conflicting observations for one market series and date.",
      );
    if (!old || observedAt > old.data.observedAt) latest.set(id, { data, raw });
    if (latest.size > 10_000) throw new Error("Source series limit exceeded.");
  }
  if (!recordCount || !latest.size)
    throw new Error("Source contains no usable observations.");
  const observations = [...latest.values()];
  const dates = observations.map((item) => item.data.observedAt).sort();
  return {
    observations,
    recordCount,
    seriesCount: observations.length,
    marketCount: new Set(observations.map((item) => item.data.marketId)).size,
    commodityCount: new Set(observations.map((item) => item.data.commodityId))
      .size,
    latestObservationAt: dates.at(-1)!,
    oldestObservationAt: dates[0],
  };
}

async function readBounded(response: Response, maximum: number) {
  if (!response.ok || !response.body)
    throw new Error("Public market source is unavailable.");
  const length = Number(response.headers.get("content-length"));
  if (length > maximum) {
    await response.body.cancel();
    throw new Error("Public market source response exceeds the size limit.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new Error(
          "Public market source response exceeds the size limit.",
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
async function fetchSource(fetchImpl: typeof fetch, now: Date) {
  const signal = AbortSignal.timeout(12_000);
  // Fixed metadata URL. A public CSV can redirect only to its exact HDX S3 object.
  const metadataBytes = await readBounded(
    await fetchImpl(MARKET_SOURCE.metadataUrl, {
      signal,
      redirect: "error",
      headers: { accept: "application/json" },
    }),
    1024 * 1024,
  );
  const result = JSON.parse(metadataBytes.toString("utf8"));
  if (
    result.success !== true ||
    result.result?.license_id !== "cc-by-igo" ||
    result.result?.organization?.name !== "wfp" ||
    !/^https?:\/\/creativecommons\.org\/licenses\/by\/3\.0\/igo\/(?:legalcode)?$/.test(
      result.result?.license_url || "",
    )
  )
    throw new Error(
      "Public source publisher or license metadata requires review.",
    );
  const resource = result.result.resources?.find(
    (item: any) => item.id === RESOURCE_ID,
  );
  if (!resource || resource.url !== MARKET_SOURCE.downloadUrl)
    throw new Error("Public source download identity requires review.");
  const rawUpdatedAt =
    resource.last_modified ||
    resource.metadata_modified ||
    result.result.metadata_modified;
  const sourceUpdatedAt =
    typeof rawUpdatedAt === "string" &&
    !/(Z|[+-]\d{2}:\d{2})$/.test(rawUpdatedAt)
      ? `${rawUpdatedAt}Z`
      : rawUpdatedAt;
  if (sourceUpdatedAt && !Number.isFinite(Date.parse(sourceUpdatedAt)))
    throw new Error("Public source update metadata is invalid.");
  let csvResponse = await fetchImpl(MARKET_SOURCE.downloadUrl, {
    signal,
    redirect: "manual",
    headers: { accept: "text/csv" },
  });
  if ([301, 302, 303, 307, 308].includes(csvResponse.status)) {
    const location = csvResponse.headers.get("location");
    await csvResponse.body?.cancel();
    if (!location || location.length > 8192)
      throw new Error("Public source redirect requires review.");
    const target = new URL(location);
    if (
      target.protocol !== "https:" ||
      target.hostname !== "s3.us-east-1.amazonaws.com" ||
      target.port ||
      target.username ||
      target.password ||
      target.pathname !==
        `/hdx-production-filestore/resources/${RESOURCE_ID}/wfp_food_prices_uga.csv`
    )
      throw new Error("Public source redirect requires review.");
    // Signed query strings remain transient; never store or log them.
    csvResponse = await fetchImpl(target, {
      signal,
      redirect: "error",
      headers: { accept: "text/csv" },
    });
  }
  const csv = await readBounded(csvResponse, MAX_CSV);
  const parsed = parseWfpCsv(csv.toString("utf8"), now);
  if (parsed.seriesCount < 50 || parsed.marketCount < 5)
    throw new SourceReviewRequired(
      "The Uganda source has unexpectedly little market coverage. A source review is required; the previous snapshot is retained.",
    );
  return {
    ...parsed,
    sourceHash: digest(csv),
    sourceUpdatedAt: sourceUpdatedAt
      ? new Date(sourceUpdatedAt).toISOString()
      : null,
  };
}

const querySchema = z
  .object({
    commodity: z.string().trim().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(200).optional(),
    market: z.string().trim().min(1).max(200).optional(),
    priceType: z.string().trim().min(1).max(80).optional(),
    unit: z.string().trim().min(1).max(80).optional(),
    currency: z.string().trim().min(1).max(20).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    cursor: z.string().max(1200).optional(),
  })
  .strict();
type Query = z.infer<typeof querySchema>;
export function createMarketDataService(
  db: Database,
  options: { fetchImpl?: typeof fetch; now?: () => Date } = {},
) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => new Date());
  let inFlight: Promise<void> | undefined;
  const ensure = () =>
    db.query(
      `INSERT INTO market_data_sources(id) VALUES($1) ON CONFLICT DO NOTHING`,
      [MARKET_SOURCE.id],
    );
  async function refresh(force = false, actor?: User) {
    if (inFlight) return inFlight;
    const work = async () => {
      await ensure();
      const started = now();
      const token = randomUUID();
      const leased = await db.transaction(async (tx) => {
        const { rows } = await tx.query<SourceRow>(
          `SELECT * FROM market_data_sources WHERE id=$1 FOR UPDATE`,
          [MARKET_SOURCE.id],
        );
        const row = rows[0];
        if (row.lease_until && new Date(row.lease_until) > started)
          return false;
        const due =
          !row.next_refresh_at || new Date(row.next_refresh_at) <= started;
        const manualAllowed =
          force &&
          row.failure_count === 0 &&
          (!row.last_attempt_at ||
            started.getTime() - new Date(row.last_attempt_at).getTime() >=
              60_000);
        if (!due && !manualAllowed) return false;
        await tx.query(
          `UPDATE market_data_sources SET lease_token=$2,lease_until=$3,last_attempt_at=$4 WHERE id=$1`,
          [
            MARKET_SOURCE.id,
            token,
            new Date(started.getTime() + 60_000).toISOString(),
            started.toISOString(),
          ],
        );
        if (actor)
          await audit(
            tx,
            actor,
            "market_source.refresh_requested",
            "market-data",
            MARKET_SOURCE.id,
          );
        return true;
      });
      if (!leased) return;
      try {
        const imported = await fetchSource(fetchImpl, started);
        const completed = now();
        await db.transaction(async (tx) => {
          const { rows } = await tx.query<SourceRow>(
            `SELECT * FROM market_data_sources WHERE id=$1 FOR UPDATE`,
            [MARKET_SOURCE.id],
          );
          if (rows[0].lease_token !== token) return;
          const previous = rows[0].metadata;
          if (
            rows[0].last_success_at &&
            (imported.latestObservationAt < previous.latestObservationAt ||
              (previous.sourceUpdatedAt &&
                imported.sourceUpdatedAt &&
                imported.sourceUpdatedAt < previous.sourceUpdatedAt) ||
              imported.seriesCount < previous.seriesCount * 0.8 ||
              imported.recordCount < previous.recordCount * 0.7)
          )
            throw new SourceReviewRequired(
              "The published file moved backward or lost substantial coverage. A source review is required; the previous snapshot is retained.",
            );
          const regressions = await tx.query(
            `SELECT 1 FROM market_observations previous JOIN jsonb_array_elements($2::jsonb) item ON previous.series_id=item->'data'->>'id' WHERE previous.source_id=$1 AND previous.observed_at>item->'data'->>'observedAt' LIMIT 1`,
            [MARKET_SOURCE.id, JSON.stringify(imported.observations)],
          );
          if (regressions.rows.length)
            throw new SourceReviewRequired(
              "One or more market series moved backward in time. A source review is required; the previous snapshot is retained.",
            );
          // Import replacement and source metadata commit atomically. No network I/O under locks.
          await tx.query(`DELETE FROM market_observations WHERE source_id=$1`, [
            MARKET_SOURCE.id,
          ]);
          await tx.query(
            `INSERT INTO market_observations(source_id,series_id,observed_at,commodity,market,price_type,unit,currency,data,raw_fields,row_hash) SELECT $1,item->'data'->>'id',item->'data'->>'observedAt',item->'data'->>'commodity',item->'data'->>'market',item->'data'->>'priceType',item->'data'->>'unit',item->'data'->>'currency',item->'data',item->'raw',item->'data'->>'rowHash' FROM jsonb_array_elements($2::jsonb) item`,
            [MARKET_SOURCE.id, JSON.stringify(imported.observations)],
          );
          const metadata = {
            sourceUpdatedAt: imported.sourceUpdatedAt,
            recordCount: imported.recordCount,
            seriesCount: imported.seriesCount,
            marketCount: imported.marketCount,
            commodityCount: imported.commodityCount,
            latestObservationAt: imported.latestObservationAt,
            oldestObservationAt: imported.oldestObservationAt,
          };
          await tx.query(
            `UPDATE market_data_sources SET generation_id=$2,source_hash=$3,metadata=$4::jsonb,last_success_at=$5,next_refresh_at=$6,lease_until=NULL,lease_token=NULL,failure_count=0,last_error=NULL WHERE id=$1`,
            [
              MARKET_SOURCE.id,
              imported.sourceHash,
              imported.sourceHash,
              JSON.stringify(metadata),
              completed.toISOString(),
              new Date(completed.getTime() + TTL).toISOString(),
            ],
          );
          await tx.query(
            `INSERT INTO market_data_imports(id,source_id,source_hash,status,record_count,series_count,started_at,finished_at) VALUES($1,$2,$3,'succeeded',$4,$5,$6,$7)`,
            [
              token,
              MARKET_SOURCE.id,
              imported.sourceHash,
              imported.recordCount,
              imported.seriesCount,
              started.toISOString(),
              completed.toISOString(),
            ],
          );
        });
      } catch (error) {
        const finished = now();
        await db.transaction(async (tx) => {
          const { rows } = await tx.query<SourceRow>(
            `SELECT * FROM market_data_sources WHERE id=$1 FOR UPDATE`,
            [MARKET_SOURCE.id],
          );
          if (rows[0].lease_token !== token) return;
          const failures = Math.min(rows[0].failure_count + 1, 10);
          const retry = Math.min(60_000 * 2 ** (failures - 1), 3_600_000);
          const safeError =
            error instanceof SourceReviewRequired
              ? error.message
              : "WFP/HDX could not be refreshed or its data failed validation. Cached observations, if present, have not been replaced.";
          await tx.query(
            `UPDATE market_data_sources SET last_error=$2,failure_count=$3,next_refresh_at=$4,lease_until=NULL,lease_token=NULL WHERE id=$1`,
            [
              MARKET_SOURCE.id,
              safeError,
              failures,
              new Date(finished.getTime() + retry).toISOString(),
            ],
          );
          await tx.query(
            `INSERT INTO market_data_imports(id,source_id,status,error,started_at,finished_at) VALUES($1,$2,'failed',$3,$4,$5)`,
            [
              token,
              MARKET_SOURCE.id,
              safeError,
              started.toISOString(),
              finished.toISOString(),
            ],
          );
        });
      }
    };
    inFlight = work().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }
  async function snapshot(query: Query) {
    const timestamp = now();
    return db.transaction(async (tx) => {
      const { rows } = await tx.query<SourceRow>(
        `SELECT * FROM market_data_sources WHERE id=$1 FOR SHARE`,
        [MARKET_SOURCE.id],
      );
      const source = rows[0];
      let cursor:
        | {
            version: string;
            date: string;
            commodity: string;
            market: string;
            id: string;
          }
        | undefined;
      if (query.cursor)
        try {
          cursor = z
            .object({
              version: z.string().length(64),
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              commodity: z.string().max(200),
              market: z.string().max(200),
              id: z.string().length(64),
            })
            .strict()
            .parse(
              JSON.parse(
                Buffer.from(query.cursor, "base64url").toString("utf8"),
              ),
            );
        } catch {
          throw new ApiError(
            400,
            "INVALID_CURSOR",
            "The market-data cursor is invalid.",
          );
        }
      if (cursor && cursor.version !== source.generation_id)
        throw new ApiError(
          409,
          "CURSOR_EXPIRED",
          "Market observations refreshed. Start from the first page.",
        );
      const values: unknown[] = [MARKET_SOURCE.id];
      const conditions = ["source_id=$1"];
      for (const [key, column] of [
        ["commodity", "commodity"],
        ["category", "data->>'category'"],
        ["market", "market"],
        ["priceType", "price_type"],
        ["unit", "unit"],
        ["currency", "currency"],
      ] as const)
        if (query[key]) {
          values.push(query[key]);
          conditions.push(`${column}=$${values.length}`);
        }
      const where = conditions.join(" AND ");
      const total = await tx.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM market_observations WHERE ${where}`,
        values,
      );
      if (cursor) {
        values.push(cursor.date, cursor.commodity, cursor.market, cursor.id);
        const n = values.length;
        conditions.push(
          `(observed_at<$${n - 3} OR (observed_at=$${n - 3} AND (commodity,market,series_id)>($${n - 2},$${n - 1},$${n})))`,
        );
      }
      values.push(query.limit + 1);
      const observations = await tx.query<{ data: Observation }>(
        `SELECT data FROM market_observations WHERE ${conditions.join(" AND ")} ORDER BY observed_at DESC,commodity,market,series_id LIMIT $${values.length}`,
        values,
      );
      const facets = await tx.query<{
        commodity: string;
        category: string;
        market: string;
        price_type: string;
        unit: string;
        currency: string;
      }>(
        `SELECT commodity,data->>'category' AS category,market,price_type,unit,currency FROM market_observations WHERE source_id=$1`,
        [MARKET_SOURCE.id],
      );
      const unique = (key: keyof (typeof facets.rows)[number]) =>
        [...new Set(facets.rows.map((row) => row[key]))].sort();
      const items = observations.rows.slice(0, query.limit).map(({ data }) => {
        const ageDays = Math.max(
          0,
          Math.floor(
            (Date.parse(ugandaCalendarDay(timestamp)) -
              Date.parse(data.observedAt)) /
              DAY,
          ),
        );
        return {
          ...data,
          ageDays,
          freshness:
            ageDays <= 62 ? "recent" : ageDays <= 183 ? "aging" : "historical",
        };
      });
      const last = items.at(-1);
      const available = Boolean(source.last_success_at);
      const refreshing = Boolean(
        source.lease_until && new Date(source.lease_until) > timestamp,
      );
      const stale =
        Boolean(source.last_error) ||
        (source.last_success_at
          ? timestamp.getTime() - new Date(source.last_success_at).getTime() >=
            TTL
          : true);
      return {
        status: available ? "available" : "unavailable",
        cacheStatus: available ? (stale ? "stale" : "fresh") : "empty",
        refreshState: refreshing
          ? "running"
          : source.failure_count &&
              source.next_refresh_at &&
              new Date(source.next_refresh_at) > timestamp
            ? "backoff"
            : "idle",
        source: {
          id: MARKET_SOURCE.id,
          title: MARKET_SOURCE.title,
          publisher: MARKET_SOURCE.publisher,
          datasetUrl: MARKET_SOURCE.datasetUrl,
          downloadUrl: MARKET_SOURCE.downloadUrl,
          license: MARKET_SOURCE.license,
          frequency: MARKET_SOURCE.frequency,
          retrievedAt: iso(source.last_success_at),
          sourceUpdatedAt: source.metadata.sourceUpdatedAt || null,
          latestObservationAt: source.metadata.latestObservationAt || null,
          oldestObservationAt: source.metadata.oldestObservationAt || null,
          sourceHash: source.source_hash,
          recordCount: source.metadata.recordCount || 0,
          seriesCount: source.metadata.seriesCount || 0,
          marketCount: source.metadata.marketCount || 0,
          commodityCount: source.metadata.commodityCount || 0,
          lastAttemptAt: iso(source.last_attempt_at),
          nextRefreshAt: iso(source.next_refresh_at),
          lastError: source.last_error,
          freshnessPolicy: { recentMaxDays: 62, agingMaxDays: 183 },
        },
        items,
        filters: {
          commodities: unique("commodity"),
          categories: unique("category"),
          markets: unique("market"),
          priceTypes: unique("price_type"),
          units: unique("unit"),
          currencies: unique("currency"),
        },
        total: total.rows[0].count,
        nextCursor:
          observations.rows.length > query.limit && last
            ? Buffer.from(
                JSON.stringify({
                  version: source.generation_id,
                  date: last.observedAt,
                  commodity: last.commodity,
                  market: last.market,
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      };
    });
  }
  async function read(input: unknown = {}) {
    const query = querySchema.parse(input);
    await ensure();
    const { rows } = await db.query<SourceRow>(
      `SELECT * FROM market_data_sources WHERE id=$1`,
      [MARKET_SOURCE.id],
    );
    if (!rows[0].last_success_at) await refresh();
    else if (
      !rows[0].next_refresh_at ||
      new Date(rows[0].next_refresh_at) <= now()
    )
      void refresh().catch(() => undefined);
    return snapshot(query);
  }
  async function readiness() {
    const { rows } = await db.query<SourceRow>(
      `SELECT * FROM market_data_sources WHERE id=$1`,
      [MARKET_SOURCE.id],
    );
    const row = rows[0];
    return {
      id: "market-data",
      name: "WFP / HDX market observations",
      status: row?.last_success_at ? "available" : "not_configured",
      detail: row?.last_success_at
        ? `Dated public observations; latest source period ${row.metadata.latestObservationAt}. Each market series retains its own observation date. ${row.last_error ? "Last refresh failed; cached snapshot retained." : ""}`
        : "Public credential-free source; import runs when market observations are opened. No successful snapshot is stored yet.",
    };
  }
  return { read, refresh, readiness };
}

export function mountMarketData(
  app: Express,
  service: ReturnType<typeof createMarketDataService>,
) {
  app.get("/api/market-data", async (req: AuthRequest, res) =>
    res.json(await service.read(req.query)),
  );
  app.post("/api/market-data/refresh", async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin")
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Administrator access is required to refresh the shared source.",
      );
    z.object({}).strict().parse(req.body);
    await service.refresh(true, req.user);
    res.json(await service.read({}));
  });
}
