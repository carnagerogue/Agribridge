import { z } from "zod";
import type { Queryable } from "./db.js";
import { marketCommittedStockSql, marketToday } from "./marketplace.js";
import type { BuyerCatalogResponse, BuyerListing } from "./buyer-types.js";

export const buyerCatalogQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(24),
    offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    q: z.string().trim().max(120).default(""),
    crop: z.string().trim().max(80).default(""),
    district: z.string().trim().max(100).default(""),
    minQuantityKg: z.coerce.number().positive().max(100_000_000).optional(),
  })
  .strict();

const day = (value: Date | string) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
type PublishedRow = {
  id: string;
  version: number;
  seller_name: string;
  crop: string;
  variety: string;
  grade: string;
  district: string;
  community: string;
  available_quantity_kg: number | string;
  expected_price_ugx_per_kg: number | null;
  harvest_from: Date | string;
  harvest_until: Date | string;
  sample: boolean;
};
function presentListing(row: PublishedRow): BuyerListing {
  return {
    id: row.id,
    version: row.version,
    sellerName: row.seller_name,
    crop: row.crop,
    variety: row.variety,
    grade: row.grade,
    district: row.district,
    community: row.community,
    availableQuantityKg: Number(row.available_quantity_kg),
    priceUgxPerKg:
      row.expected_price_ugx_per_kg === null
        ? null
        : Number(row.expected_price_ugx_per_kg),
    harvestFrom: day(row.harvest_from),
    harvestUntil: day(row.harvest_until),
    sample: Boolean(row.sample),
    qualityEvidence: "seller_declared",
  };
}

/** Cross-organization visibility is deliberate and limited to a seller's explicit published projection. */
export async function listBuyerCatalog(
  db: Queryable,
  raw: unknown = {},
  options: { includeSample?: boolean; now?: Date } = {},
): Promise<BuyerCatalogResponse> {
  const input = buyerCatalogQuerySchema.parse(raw);
  const values: unknown[] = [marketToday(options.now)],
    where = [
      "s.published=true",
      "s.status='available'",
      "s.harvest_until>=$1::date",
      "u.active=true",
    ];
  if (!options.includeSample) where.push("s.sample=false", "p.sample=false");
  const add = (condition: string, value: unknown) => {
    values.push(value);
    where.push(condition.replaceAll("?", `$${values.length}`));
  };
  if (input.crop) add("lower(s.crop)=lower(?)", input.crop);
  if (input.district) add("lower(s.district)=lower(?)", input.district);
  if (input.q)
    add(
      "position(lower(?) in lower(concat_ws(' ',s.crop,s.variety,s.grade,s.district,s.community,p.business_name)))>0",
      input.q,
    );
  add(`s.quantity_kg-${marketCommittedStockSql}>=?`, input.minQuantityKg ?? 1);
  values.push(input.limit + 1, input.offset);
  const rows = (
    await db.query<PublishedRow>(
      `SELECT s.id,s.version,p.business_name AS seller_name,s.crop,s.variety,s.grade,s.district,s.community,
    s.quantity_kg-${marketCommittedStockSql} AS available_quantity_kg,s.expected_price_ugx_per_kg,s.harvest_from,s.harvest_until,s.sample
    FROM market_supply s JOIN market_profiles p ON p.tenant_id=s.tenant_id AND p.id=s.profile_id
    JOIN users u ON u.tenant_id=s.tenant_id AND u.id=s.owner_id WHERE ${where.join(" AND ")}
    ORDER BY s.created_at DESC,s.id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )
  ).rows;
  return {
    items: rows.slice(0, input.limit).map(presentListing),
    pagination: {
      limit: input.limit,
      offset: input.offset,
      hasMore: rows.length > input.limit,
    },
    sample: Boolean(options.includeSample),
  };
}
