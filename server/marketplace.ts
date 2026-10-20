import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Database, Queryable } from "./db.js";
import {
  ApiError,
  requireOperator,
  type AuthRequest,
  type User,
} from "./security.js";
import { audit, mutate } from "./store.js";
import type {
  BuyerDemand,
  MarketCatalog,
  MarketInterest,
  MarketMatch,
  MarketOverview,
  MarketProfile,
  MarketServiceQuote,
  SupplyListing,
} from "./marketplace-types.js";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).default("");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Use a real calendar date.");
const money = z.number().int().positive().max(100_000_000);
const quantity = z.number().positive().max(100_000_000);
const sourceUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a public HTTPS source URL without credentials.")
  .default("");
const phone = z
  .string()
  .trim()
  .transform((value) =>
    value.replace(/[\s()-]/g, "").replace(/^0(?=[37]\d{8}$)/, "+256"),
  )
  .pipe(
    z
      .string()
      .regex(
        /^\+256[37]\d{8}$/,
        "Use a Uganda mobile number, for example +256 followed by the mobile number.",
      ),
  );

export const marketProfileSchema = z
  .object({
    name: text(100),
    businessName: text(160),
    phone,
    district: text(100),
    community: text(140),
    farmSizeAcres: z.number().positive().max(100_000).nullable().default(null),
    crops: z
      .array(text(80))
      .min(1)
      .max(20)
      .transform((items) => [
        ...new Map(items.map((item) => [normalized(item), item])).values(),
      ]),
    language: z.enum(["en", "lg"]).default("en"),
  })
  .strict();
export const marketSupplySchema = z
  .object({
    crop: text(80),
    variety: optionalText(100),
    quantityKg: quantity,
    expectedPriceUgxPerKg: money.nullable().default(null),
    harvestFrom: day,
    harvestUntil: day,
    district: text(100),
    community: text(140),
    grade: optionalText(140),
    qualityNotes: optionalText(1600),
    status: z.enum(["available", "paused", "sold"]).default("available"),
  })
  .strict();
export const marketDemandSchema = z
  .object({
    organization: text(160),
    crop: text(80),
    variety: optionalText(100),
    grade: optionalText(140),
    quantityKg: quantity,
    priceUgxPerKg: money.nullable().default(null),
    district: text(100),
    availableFrom: day,
    deadline: day,
    requirements: optionalText(1600),
    status: z.enum(["open", "paused", "closed"]).default("open"),
  })
  .strict();
export const marketServiceSchema = z
  .object({
    category: z.enum(["input", "transport", "storage"]),
    name: text(160),
    provider: text(160),
    district: text(100),
    community: optionalText(140),
    crop: optionalText(80),
    priceUgx: z.number().int().positive().max(1_000_000_000),
    unit: text(100),
    sourceTitle: text(240),
    sourceUrl,
    observedAt: day,
    validUntil: day,
    verificationStatus: z.enum(["reported", "verified"]).default("reported"),
    notes: optionalText(1600),
  })
  .strict();

type Row = Record<string, any>;
const committedStock =
  "COALESCE((SELECT sum(o.quantity_kg) FROM market_orders o WHERE o.tenant_id=s.tenant_id AND o.supply_id=s.id AND o.status IN ('accepted','fulfilled')),0)";
const iso = (value: unknown) => new Date(String(value)).toISOString();
const dateOnly = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
export const marketToday = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(date);
function normalized(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en");
}
function metadata(row: Row) {
  return {
    id: row.id as string,
    version: Number(row.version),
    sample: Boolean(row.sample),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
export function presentMarketProfile(row: Row): MarketProfile {
  return {
    ...metadata(row),
    name: row.name,
    businessName: row.business_name,
    phone: row.phone,
    phoneVerified: false,
    district: row.district,
    community: row.community,
    farmSizeAcres:
      row.farm_size_acres === null ? null : Number(row.farm_size_acres),
    crops: row.crops,
    language: row.language,
  };
}
export function presentMarketSupply(row: Row): SupplyListing {
  return {
    ...metadata(row),
    profileId: row.profile_id,
    crop: row.crop,
    variety: row.variety,
    quantityKg: Number(row.quantity_kg),
    ...(row.remaining_quantity_kg !== undefined
      ? { remainingQuantityKg: Math.max(0, Number(row.remaining_quantity_kg)) }
      : {}),
    expectedPriceUgxPerKg:
      row.expected_price_ugx_per_kg === null
        ? null
        : Number(row.expected_price_ugx_per_kg),
    harvestFrom: dateOnly(row.harvest_from),
    harvestUntil: dateOnly(row.harvest_until),
    district: row.district,
    community: row.community,
    grade: row.grade,
    qualityNotes: row.quality_notes,
    status: row.status,
    ...(row.seller_name ? { sellerName: row.seller_name } : {}),
  };
}
export function presentMarketDemand(row: Row): BuyerDemand {
  return {
    ...metadata(row),
    organization: row.organization,
    crop: row.crop,
    variety: row.variety,
    grade: row.grade,
    quantityKg: Number(row.quantity_kg),
    priceUgxPerKg:
      row.price_ugx_per_kg === null ? null : Number(row.price_ugx_per_kg),
    district: row.district,
    availableFrom: dateOnly(row.available_from),
    deadline: dateOnly(row.deadline),
    requirements: row.requirements,
    status: row.status,
  };
}
export function presentMarketService(
  row: Row,
  today = marketToday(),
): MarketServiceQuote {
  const observedAt = dateOnly(row.observed_at),
    validUntil = dateOnly(row.valid_until);
  return {
    ...metadata(row),
    category: row.category,
    name: row.name,
    provider: row.provider,
    district: row.district,
    community: row.community,
    crop: row.crop,
    priceUgx: Number(row.price_ugx),
    unit: row.unit,
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    observedAt,
    validUntil,
    verificationStatus: row.verification_status,
    freshness:
      observedAt > today
        ? "future"
        : validUntil < today
          ? "expired"
          : "current",
    notes: row.notes,
  };
}
function presentInterest(row: Row): MarketInterest {
  return {
    ...metadata(row),
    supplyId: row.supply_id,
    demandId: row.demand_id,
    message: row.message,
    status: row.status,
  };
}

type QueryOptions = {
  limit?: number;
  offset?: number;
  crop?: string;
  district?: string;
  includeSample?: boolean;
  today?: string;
};
const bounded = (value: number | undefined, fallback: number, max: number) =>
  Number.isInteger(value) && value! >= 0 ? Math.min(value!, max) : fallback;
export async function listMarketDemand(
  db: Queryable,
  tenantId: string,
  options: QueryOptions & { activeOnly?: boolean } = {},
): Promise<BuyerDemand[]> {
  const parameters: unknown[] = [tenantId],
    where = ["tenant_id=$1"];
  const add = (condition: string, value: unknown) => {
    parameters.push(value);
    where.push(condition.replace("?", `$${parameters.length}`));
  };
  if (!options.includeSample) where.push("sample=false");
  if (options.activeOnly !== false) {
    where.push("status='open'");
    add("deadline>=?::date", options.today || marketToday());
  }
  if (options.crop) add("lower(crop)=lower(?)", options.crop.trim());
  if (options.district)
    add("lower(district)=lower(?)", options.district.trim());
  parameters.push(
    bounded(options.limit, 30, 101),
    bounded(options.offset, 0, 1_000_000),
  );
  return (
    await db.query<Row>(
      `SELECT * FROM market_demand WHERE ${where.join(" AND ")} ORDER BY deadline ASC,id ASC LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )
  ).rows.map(presentMarketDemand);
}
export async function listMarketServices(
  db: Queryable,
  tenantId: string,
  options: QueryOptions & {
    category?: "input" | "transport" | "storage";
    currentOnly?: boolean;
  } = {},
): Promise<MarketServiceQuote[]> {
  const parameters: unknown[] = [tenantId],
    where = ["tenant_id=$1"];
  const add = (condition: string, value: unknown) => {
    parameters.push(value);
    where.push(condition.replace("?", `$${parameters.length}`));
  };
  if (!options.includeSample)
    where.push("sample=false AND verification_status<>'sample'");
  if (options.currentOnly !== false) {
    add("observed_at<=?::date", options.today || marketToday());
    add("valid_until>=?::date", options.today || marketToday());
  }
  if (options.crop)
    add("(crop='' OR lower(crop)=lower(?))", options.crop.trim());
  if (options.district)
    add("lower(district)=lower(?)", options.district.trim());
  if (options.category) add("category=?", options.category);
  parameters.push(
    bounded(options.limit, 30, 101),
    bounded(options.offset, 0, 1_000_000),
  );
  return (
    await db.query<Row>(
      `SELECT * FROM market_services WHERE ${where.join(" AND ")} ORDER BY observed_at DESC,id ASC LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )
  ).rows.map((row) => presentMarketService(row, options.today));
}

/** Deterministic compatibility, never an acceptance, certification or probability. */
export function matchMarketSupply(
  supply: readonly SupplyListing[],
  demand: readonly BuyerDemand[],
  today = marketToday(),
): MarketMatch[] {
  const matches: MarketMatch[] = [];
  for (const lot of supply)
    for (const request of demand) {
      const remaining = lot.remainingQuantityKg ?? lot.quantityKg;
      if (
        lot.status !== "available" ||
        remaining <= 0 ||
        lot.harvestUntil < today ||
        request.status !== "open" ||
        request.deadline < today ||
        normalized(lot.crop) !== normalized(request.crop)
      )
        continue;
      if (
        lot.harvestFrom > request.deadline ||
        lot.harvestUntil < request.availableFrom
      )
        continue;
      if (
        lot.variety &&
        request.variety &&
        normalized(lot.variety) !== normalized(request.variety)
      )
        continue;
      let score = 50;
      const reasons = [
          "Crop matches the buyer request.",
          "The harvest and buying windows overlap.",
        ],
        checks = [
          "Buyer must confirm quantity, quality, collection and final terms. Seller quality is not independently certified.",
        ];
      if (normalized(lot.district) === normalized(request.district)) {
        score += 15;
        reasons.push("Supply and buyer request are in the same district.");
      } else
        checks.push(
          `Transport from ${lot.district} to ${request.district} needs a separate quote.`,
        );
      if (lot.variety && request.variety) {
        score += 10;
        reasons.push("Declared variety matches.");
      } else checks.push("Confirm the variety with the buyer.");
      const matchedQuantity = Math.min(remaining, request.quantityKg),
        coveragePercent = Math.min(
          100,
          Math.round((remaining / request.quantityKg) * 100),
        );
      if (remaining >= request.quantityKg) {
        score += 15;
        reasons.push("Declared quantity can cover this request.");
      } else
        checks.push(
          `This supply covers ${coveragePercent}% of the requested quantity; the buyer must accept a partial contribution or aggregation.`,
        );
      if (request.grade)
        checks.push(
          `Buyer requires ${request.grade}. ${lot.grade ? `Seller declares ${lot.grade}; inspection is still required.` : "No seller grade is recorded; inspection is required."}`,
        );
      if (
        lot.expectedPriceUgxPerKg !== null &&
        request.priceUgxPerKg !== null
      ) {
        if (lot.expectedPriceUgxPerKg <= request.priceUgxPerKg) {
          score += 10;
          reasons.push(
            "Recorded buyer price meets the seller's expected price before costs.",
          );
        } else
          checks.push(
            "Buyer price is below the seller's expectation; agree the price before committing.",
          );
      } else
        checks.push("Price is on request; this is not an executable quote.");
      const gross =
        request.priceUgxPerKg === null
          ? null
          : Math.round(matchedQuantity * request.priceUgxPerKg);
      matches.push({
        id: `${lot.id}:${request.id}`,
        supplyId: lot.id,
        demandId: request.id,
        crop: lot.crop,
        organization: request.organization,
        score,
        quantityKg: matchedQuantity,
        coveragePercent,
        estimatedGrossUgx:
          gross !== null && Number.isSafeInteger(gross) ? gross : null,
        sample: lot.sample || request.sample,
        reasons,
        checks,
      });
    }
  return matches.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

async function ownProfile(db: Queryable, user: User, lock = false) {
  return (
    await db.query<Row>(
      `SELECT * FROM market_profiles WHERE tenant_id=$1 AND owner_id=$2${lock ? " FOR UPDATE" : ""}`,
      [user.organizationId, user.id],
    )
  ).rows[0];
}
async function scopedRecord(
  db: Queryable,
  table:
    "market_supply" | "market_demand" | "market_services" | "market_interests",
  user: User,
  id: string,
  lock = false,
) {
  const row = (
    await db.query<Row>(
      table === "market_supply"
        ? `SELECT s.*,s.quantity_kg-${committedStock} AS remaining_quantity_kg FROM market_supply s WHERE s.tenant_id=$1 AND s.id=$2${lock ? " FOR UPDATE" : ""}`
        : `SELECT * FROM ${table} WHERE tenant_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [user.organizationId, id],
    )
  ).rows[0];
  if (
    !row ||
    (user.role === "farmer" &&
      (table === "market_supply" || table === "market_interests") &&
      row.owner_id !== user.id)
  )
    throw new ApiError(404, "NOT_FOUND", "Market record not found.");
  return row;
}
function assertVersion(row: Row, version: number | undefined) {
  if (version === undefined)
    throw new ApiError(
      400,
      "VERSION_REQUIRED",
      "Include the current version when changing a record.",
    );
  if (Number(row.version) !== version)
    throw new ApiError(
      409,
      "VERSION_CONFLICT",
      "This record changed. Reload it before saving.",
    );
}
function dateWindow(from: string, until: string) {
  if (until < from)
    throw new ApiError(
      400,
      "INVALID_DATE_RANGE",
      "The end date cannot be before the start date.",
    );
}
function freshWindow(from: string, until: string) {
  dateWindow(from, until);
  if (until < marketToday())
    throw new ApiError(
      400,
      "EXPIRED_MARKET_WINDOW",
      "Use a current or future availability window.",
    );
}
function serviceDates(input: z.infer<typeof marketServiceSchema>) {
  dateWindow(input.observedAt, input.validUntil);
  if (input.observedAt > marketToday())
    throw new ApiError(
      400,
      "FUTURE_OBSERVATION",
      "A source observation cannot be dated in the future.",
    );
}
async function updateFields(
  db: Queryable,
  table: string,
  tenant: string,
  id: string,
  fields: Record<string, unknown>,
) {
  const entries = Object.entries(fields),
    values = entries.map(([, value]) => value);
  values.push(tenant, id);
  return (
    await db.query<Row>(
      `UPDATE ${table} SET ${entries.map(([key], index) => `${key}=$${index + 1}`).join(",")},version=version+1,updated_at=now() WHERE tenant_id=$${values.length - 1} AND id=$${values.length} RETURNING *`,
      values,
    )
  ).rows[0];
}
function pickPatch(parsed: Record<string, unknown>, body: object) {
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([key]) => key !== "version" && Object.hasOwn(body, key),
    ),
  );
}
function supplyColumns(input: z.infer<typeof marketSupplySchema>) {
  return {
    crop: input.crop,
    variety: input.variety,
    quantity_kg: input.quantityKg,
    expected_price_ugx_per_kg: input.expectedPriceUgxPerKg,
    harvest_from: input.harvestFrom,
    harvest_until: input.harvestUntil,
    district: input.district,
    community: input.community,
    grade: input.grade,
    quality_notes: input.qualityNotes,
    status: input.status,
  };
}
function demandColumns(input: z.infer<typeof marketDemandSchema>) {
  return {
    organization: input.organization,
    crop: input.crop,
    variety: input.variety,
    grade: input.grade,
    quantity_kg: input.quantityKg,
    price_ugx_per_kg: input.priceUgxPerKg,
    district: input.district,
    available_from: input.availableFrom,
    deadline: input.deadline,
    requirements: input.requirements,
    status: input.status,
  };
}
function serviceColumns(
  input: z.infer<typeof marketServiceSchema>,
  sample: boolean,
) {
  return {
    category: input.category,
    name: input.name,
    provider: input.provider,
    district: input.district,
    community: input.community,
    crop: input.crop,
    price_ugx: input.priceUgx,
    unit: input.unit,
    source_title: input.sourceTitle,
    source_url: input.sourceUrl,
    observed_at: input.observedAt,
    valid_until: input.validUntil,
    verification_status: sample ? "sample" : input.verificationStatus,
    notes: input.notes,
  };
}
async function insertRow(
  db: Queryable,
  table: string,
  user: User,
  fields: Record<string, unknown>,
  sample: boolean,
) {
  const all = {
    id: randomUUID(),
    tenant_id: user.organizationId,
    owner_id: user.id,
    sample,
    ...fields,
  };
  const entries = Object.entries(all);
  return (
    await db.query<Row>(
      `INSERT INTO ${table}(${entries.map(([key]) => key).join(",")}) VALUES(${entries.map((_, index) => `$${index + 1}`).join(",")}) RETURNING *`,
      entries.map(([, value]) => value),
    )
  ).rows[0];
}

export function mountMarketplace(
  app: Express,
  db: Database,
  config: AppConfig,
  _env: NodeJS.ProcessEnv = process.env,
) {
  app.get("/api/marketplace/catalog", async (req: AuthRequest, res) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
        crop: z.string().trim().max(80).optional(),
        district: z.string().trim().max(100).optional(),
      })
      .strict()
      .parse(req.query);
    const user = req.user!,
      values: unknown[] = [user.organizationId, marketToday()],
      conditions = [
        "s.tenant_id=$1",
        "s.status='available'",
        "s.harvest_until>=$2::date",
      ];
    if (!config.demo) conditions.push("s.sample=false");
    if (query.crop) {
      values.push(query.crop);
      conditions.push(`lower(s.crop)=lower($${values.length})`);
    }
    if (query.district) {
      values.push(query.district);
      conditions.push(`lower(s.district)=lower($${values.length})`);
    }
    const committed = committedStock;
    conditions.push(`s.quantity_kg>${committed}`);
    values.push(query.limit + 1, query.offset);
    const rows = (
      await db.query<Row>(
        `SELECT s.*,p.business_name AS seller_name,s.quantity_kg-${committed} AS remaining_quantity_kg FROM market_supply s JOIN market_profiles p ON p.tenant_id=s.tenant_id AND p.id=s.profile_id WHERE ${conditions.join(" AND ")} ORDER BY s.created_at DESC,s.id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      )
    ).rows;
    const result: MarketCatalog = {
      supply: rows.slice(0, query.limit).map((row) => ({
        ...presentMarketSupply(row),
        sellerId: row.owner_id,
        remainingQuantityKg: Number(row.remaining_quantity_kg),
      })),
      sample: config.demo,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: rows.length > query.limit,
      },
    };
    res.json(result);
  });
  app.get("/api/marketplace/overview", async (req: AuthRequest, res) => {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
        crop: z.string().trim().max(80).optional(),
        district: z.string().trim().max(100).optional(),
      })
      .strict()
      .parse(req.query);
    const user = req.user!,
      parameters: unknown[] = [user.organizationId],
      conditions = ["s.tenant_id=$1"];
    if (user.role === "farmer") {
      parameters.push(user.id);
      conditions.push(`s.owner_id=$${parameters.length}`);
    }
    if (!config.demo) conditions.push("s.sample=false");
    if (query.crop) {
      parameters.push(query.crop);
      conditions.push(`lower(s.crop)=lower($${parameters.length})`);
    }
    if (query.district) {
      parameters.push(query.district);
      conditions.push(`lower(s.district)=lower($${parameters.length})`);
    }
    parameters.push(query.limit + 1, query.offset);
    const interestValues: unknown[] = [user.organizationId],
      interestConditions = ["tenant_id=$1"];
    if (user.role === "farmer") {
      interestValues.push(user.id);
      interestConditions.push(`owner_id=$${interestValues.length}`);
    }
    if (!config.demo) interestConditions.push("sample=false");
    interestValues.push(query.limit + 1, query.offset);
    const [profile, supplyRows, demandRows, serviceRows, interestRows] =
      await Promise.all([
        ownProfile(db, user),
        db.query<Row>(
          `SELECT s.*,p.business_name AS seller_name,s.quantity_kg-${committedStock} AS remaining_quantity_kg FROM market_supply s JOIN market_profiles p ON p.tenant_id=s.tenant_id AND p.id=s.profile_id WHERE ${conditions.join(" AND ")} ORDER BY s.created_at DESC,s.id ASC LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
          parameters,
        ),
        listMarketDemand(db, user.organizationId, {
          ...query,
          limit: query.limit + 1,
          includeSample: config.demo,
          activeOnly: false,
        }),
        listMarketServices(db, user.organizationId, {
          ...query,
          limit: query.limit + 1,
          includeSample: config.demo,
          currentOnly: false,
        }),
        db.query<Row>(
          `SELECT * FROM market_interests WHERE ${interestConditions.join(" AND ")} ORDER BY created_at DESC,id ASC LIMIT $${interestValues.length - 1} OFFSET $${interestValues.length}`,
          interestValues,
        ),
      ]);
    const supply = supplyRows.rows
        .slice(0, query.limit)
        .map(presentMarketSupply),
      demand = demandRows.slice(0, query.limit);
    const result: MarketOverview = {
      profile:
        profile && (config.demo || !profile.sample)
          ? presentMarketProfile(profile)
          : null,
      supply,
      demand,
      services: serviceRows.slice(0, query.limit),
      matches: matchMarketSupply(supply, demand),
      interests: interestRows.rows.slice(0, query.limit).map(presentInterest),
      sample: config.demo,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        hasMore: {
          supply: supplyRows.rows.length > query.limit,
          demand: demandRows.length > query.limit,
          services: serviceRows.length > query.limit,
          interests: interestRows.rows.length > query.limit,
        },
      },
    };
    res.json(result);
  });
  app.post("/api/marketplace/profile", async (req: AuthRequest, res) => {
    const input = marketProfileSchema
        .extend({ version: z.number().int().positive().optional() })
        .parse(req.body),
      user = req.user!;
    const result = await mutate(db, req, async (tx) => {
      // Serialize first-time signup too: locking a nonexistent profile cannot prevent a concurrent insert.
      await tx.query(
        "SELECT id FROM users WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
        [user.organizationId, user.id],
      );
      const previous = await ownProfile(tx, user, true);
      const values = {
        name: input.name,
        business_name: input.businessName,
        phone: input.phone,
        district: input.district,
        community: input.community,
        farm_size_acres: input.farmSizeAcres,
        crops: input.crops,
        language: input.language,
      };
      if (previous) assertVersion(previous, input.version);
      else if (input.version !== undefined)
        throw new ApiError(
          409,
          "VERSION_CONFLICT",
          "This profile does not exist yet. Reload before creating it.",
        );
      const row = previous
        ? await updateFields(
            tx,
            "market_profiles",
            user.organizationId,
            previous.id,
            values,
          )
        : await insertRow(tx, "market_profiles", user, values, config.demo);
      await audit(
        tx,
        user,
        previous ? "market.profile_updated" : "market.profile_created",
        "market_profiles",
        row.id,
      );
      return { status: previous ? 200 : 201, body: presentMarketProfile(row) };
    });
    res.status(result.status).json(result.body);
  });
  app.post("/api/marketplace/supply", async (req: AuthRequest, res) => {
    const input = marketSupplySchema.parse(req.body),
      user = req.user!;
    freshWindow(input.harvestFrom, input.harvestUntil);
    const result = await mutate(db, req, async (tx) => {
      const profile = await ownProfile(tx, user);
      if (!profile)
        throw new ApiError(
          409,
          "PROFILE_REQUIRED",
          "Create your business profile before sharing produce.",
        );
      const row = await insertRow(
        tx,
        "market_supply",
        user,
        { profile_id: profile.id, ...supplyColumns(input) },
        config.demo || Boolean(profile.sample),
      );
      await audit(tx, user, "market.supply_created", "market_supply", row.id);
      return { status: 201, body: presentMarketSupply(row) };
    });
    res.status(result.status).json(result.body);
  });
  app.patch("/api/marketplace/supply/:id", async (req: AuthRequest, res) => {
    const parsed = marketSupplySchema
        .partial()
        .extend({ version: z.number().int().positive() })
        .strict()
        .parse(req.body),
      user = req.user!;
    const result = await mutate(db, req, async (tx) => {
      const previous = await scopedRecord(
        tx,
        "market_supply",
        user,
        String(req.params.id),
        true,
      );
      assertVersion(previous, parsed.version);
      const updates = pickPatch(parsed, req.body);
      if (!Object.keys(updates).length)
        throw new ApiError(400, "EMPTY_UPDATE", "No changes were provided.");
      const input = marketSupplySchema.parse({
        ...pickSupply(presentMarketSupply(previous)),
        ...updates,
      });
      // An already-expired listing can still be paused or marked sold.
      dateWindow(input.harvestFrom, input.harvestUntil);
      if (input.status === "available")
        freshWindow(input.harvestFrom, input.harvestUntil);
      const availableOrders = await tx.query<{ present: boolean }>(
        "SELECT to_regclass('market_orders') IS NOT NULL AS present",
      );
      if (availableOrders.rows[0]?.present) {
        const reservation = await tx.query<{ quantity: number }>(
          "SELECT COALESCE(sum(quantity_kg),0) AS quantity FROM market_orders WHERE tenant_id=$1 AND supply_id=$2 AND status IN ('accepted','fulfilled')",
          [user.organizationId, previous.id],
        );
        const committed = Number(reservation.rows[0]?.quantity || 0);
        if (input.quantityKg < committed)
          throw new ApiError(
            409,
            "STOCK_COMMITTED",
            "The new quantity is below stock already committed to orders.",
          );
        if (committed > 0) {
          const before = supplyColumns(
              marketSupplySchema.parse(
                pickSupply(presentMarketSupply(previous)),
              ),
            ),
            after = supplyColumns(input);
          for (const field of [
            "crop",
            "variety",
            "expected_price_ugx_per_kg",
            "harvest_from",
            "harvest_until",
            "district",
            "community",
            "grade",
          ] as const)
            if (before[field] !== after[field])
              throw new ApiError(
                409,
                "STOCK_COMMITTED",
                "Commercial terms and quality declarations cannot change while orders are committed.",
              );
        }
      }
      const row = await updateFields(
        tx,
        "market_supply",
        user.organizationId,
        previous.id,
        supplyColumns(input),
      );
      await audit(tx, user, "market.supply_updated", "market_supply", row.id);
      return { status: 200, body: presentMarketSupply(row) };
    });
    res.status(result.status).json(result.body);
  });
  app.post(
    "/api/marketplace/demand",
    requireOperator,
    async (req: AuthRequest, res) => {
      const input = marketDemandSchema.parse(req.body),
        user = req.user!;
      freshWindow(input.availableFrom, input.deadline);
      const result = await mutate(db, req, async (tx) => {
        const row = await insertRow(
          tx,
          "market_demand",
          user,
          demandColumns(input),
          config.demo,
        );
        await audit(tx, user, "market.demand_created", "market_demand", row.id);
        return { status: 201, body: presentMarketDemand(row) };
      });
      res.status(result.status).json(result.body);
    },
  );
  app.patch(
    "/api/marketplace/demand/:id",
    requireOperator,
    async (req: AuthRequest, res) => {
      const parsed = marketDemandSchema
          .partial()
          .extend({ version: z.number().int().positive() })
          .strict()
          .parse(req.body),
        user = req.user!;
      const result = await mutate(db, req, async (tx) => {
        const previous = await scopedRecord(
          tx,
          "market_demand",
          user,
          String(req.params.id),
          true,
        );
        assertVersion(previous, parsed.version);
        const updates = pickPatch(parsed, req.body);
        if (!Object.keys(updates).length)
          throw new ApiError(400, "EMPTY_UPDATE", "No changes were provided.");
        const current = presentMarketDemand(previous),
          input = marketDemandSchema.parse({
            organization: current.organization,
            crop: current.crop,
            variety: current.variety,
            grade: current.grade,
            quantityKg: current.quantityKg,
            priceUgxPerKg: current.priceUgxPerKg,
            district: current.district,
            availableFrom: current.availableFrom,
            deadline: current.deadline,
            requirements: current.requirements,
            status: current.status,
            ...updates,
          });
        dateWindow(input.availableFrom, input.deadline);
        if (input.status === "open")
          freshWindow(input.availableFrom, input.deadline);
        const row = await updateFields(
          tx,
          "market_demand",
          user.organizationId,
          previous.id,
          demandColumns(input),
        );
        await audit(tx, user, "market.demand_updated", "market_demand", row.id);
        return { status: 200, body: presentMarketDemand(row) };
      });
      res.status(result.status).json(result.body);
    },
  );
  app.post(
    "/api/marketplace/services",
    requireOperator,
    async (req: AuthRequest, res) => {
      const input = marketServiceSchema.parse(req.body),
        user = req.user!;
      serviceDates(input);
      const result = await mutate(db, req, async (tx) => {
        const row = await insertRow(
          tx,
          "market_services",
          user,
          serviceColumns(input, config.demo),
          config.demo,
        );
        await audit(
          tx,
          user,
          "market.service_created",
          "market_services",
          row.id,
        );
        return { status: 201, body: presentMarketService(row) };
      });
      res.status(result.status).json(result.body);
    },
  );
  app.patch(
    "/api/marketplace/services/:id",
    requireOperator,
    async (req: AuthRequest, res) => {
      const parsed = marketServiceSchema
          .partial()
          .extend({ version: z.number().int().positive() })
          .strict()
          .parse(req.body),
        user = req.user!;
      const result = await mutate(db, req, async (tx) => {
        const previous = await scopedRecord(
          tx,
          "market_services",
          user,
          String(req.params.id),
          true,
        );
        assertVersion(previous, parsed.version);
        const updates = pickPatch(parsed, req.body);
        if (!Object.keys(updates).length)
          throw new ApiError(400, "EMPTY_UPDATE", "No changes were provided.");
        const current = presentMarketService(previous),
          input = marketServiceSchema.parse({
            category: current.category,
            name: current.name,
            provider: current.provider,
            district: current.district,
            community: current.community,
            crop: current.crop,
            priceUgx: current.priceUgx,
            unit: current.unit,
            sourceTitle: current.sourceTitle,
            sourceUrl: current.sourceUrl,
            observedAt: current.observedAt,
            validUntil: current.validUntil,
            verificationStatus:
              current.verificationStatus === "sample"
                ? "reported"
                : current.verificationStatus,
            notes: current.notes,
            ...updates,
          });
        serviceDates(input);
        const row = await updateFields(
          tx,
          "market_services",
          user.organizationId,
          previous.id,
          serviceColumns(input, Boolean(previous.sample)),
        );
        await audit(
          tx,
          user,
          "market.service_updated",
          "market_services",
          row.id,
        );
        return { status: 200, body: presentMarketService(row) };
      });
      res.status(result.status).json(result.body);
    },
  );
  app.post("/api/marketplace/interest", async (req: AuthRequest, res) => {
    const input = z
        .object({
          supplyId: z.string().uuid(),
          demandId: z.string().uuid(),
          message: optionalText(1000),
        })
        .strict()
        .parse(req.body),
      user = req.user!;
    const result = await mutate(db, req, async (tx) => {
      const supply = await scopedRecord(
          tx,
          "market_supply",
          user,
          input.supplyId,
          true,
        ),
        demand = await scopedRecord(
          tx,
          "market_demand",
          user,
          input.demandId,
          true,
        );
      if (
        !matchMarketSupply(
          [presentMarketSupply(supply)],
          [presentMarketDemand(demand)],
        ).length
      )
        throw new ApiError(
          409,
          "MARKET_NO_LONGER_MATCHES",
          "This supply and buyer request no longer have a compatible crop, variety and buying window.",
        );
      const previous = (
        await tx.query<Row>(
          "SELECT * FROM market_interests WHERE tenant_id=$1 AND owner_id=$2 AND supply_id=$3 AND demand_id=$4",
          [user.organizationId, supply.owner_id, supply.id, demand.id],
        )
      ).rows[0];
      if (previous?.status === "closed")
        throw new ApiError(
          409,
          "INTRODUCTION_CLOSED",
          "This introduction is closed. Ask the team to review it before making another request.",
        );
      if (previous) return { status: 200, body: presentInterest(previous) };
      const row = (
        await tx.query<Row>(
          "INSERT INTO market_interests(id,tenant_id,owner_id,supply_id,demand_id,message,sample) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            randomUUID(),
            user.organizationId,
            supply.owner_id,
            supply.id,
            demand.id,
            input.message,
            Boolean(supply.sample || demand.sample),
          ],
        )
      ).rows[0];
      await audit(
        tx,
        user,
        "market.introduction_requested",
        "market_interests",
        row.id,
      );
      return { status: 201, body: presentInterest(row) };
    });
    res.status(result.status).json(result.body);
  });
  app.patch(
    "/api/marketplace/interest/:id",
    requireOperator,
    async (req: AuthRequest, res) => {
      const input = z
          .object({
            version: z.number().int().positive(),
            status: z.enum(["acknowledged", "closed"]),
          })
          .strict()
          .parse(req.body),
        user = req.user!;
      const result = await mutate(db, req, async (tx) => {
        const previous = await scopedRecord(
          tx,
          "market_interests",
          user,
          String(req.params.id),
          true,
        );
        assertVersion(previous, input.version);
        if (previous.status === "closed" && input.status !== "closed")
          throw new ApiError(
            409,
            "INTRODUCTION_CLOSED",
            "A closed introduction cannot be reopened.",
          );
        const row = await updateFields(
          tx,
          "market_interests",
          user.organizationId,
          previous.id,
          { status: input.status },
        );
        await audit(
          tx,
          user,
          "market.introduction_updated",
          "market_interests",
          row.id,
        );
        return { status: 200, body: presentInterest(row) };
      });
      res.status(result.status).json(result.body);
    },
  );
}

function pickSupply(current: SupplyListing) {
  return {
    crop: current.crop,
    variety: current.variety,
    quantityKg: current.quantityKg,
    expectedPriceUgxPerKg: current.expectedPriceUgxPerKg,
    harvestFrom: current.harvestFrom,
    harvestUntil: current.harvestUntil,
    district: current.district,
    community: current.community,
    grade: current.grade,
    qualityNotes: current.qualityNotes,
    status: current.status,
  };
}

export { seedMarketplace } from "./marketplace-seed.js";
