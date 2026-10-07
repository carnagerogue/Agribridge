import { randomUUID } from "node:crypto";
import type { Queryable } from "./db.js";

/**
 * Maps each API record type to its typed table. The API shape is unchanged:
 * callers read and write camelCase fields and this module converts them to
 * columns. Writing a field without a column is a programming error, so new
 * fields always arrive with a migration rather than being silently dropped.
 *
 * Keep this registry in step with server/migrations. A test compares it with
 * the migrated database schema.
 */

export type ColumnKind =
  | "text"
  | "integer"
  | "bigint"
  | "float"
  | "boolean"
  | "date"
  | "timestamptz"
  | "jsonb"
  | "text[]";
/**
 * How a NULL column appears in the API record: `null`, an omitted key, or an
 * empty string. `omit` and `empty` fields also store an empty string as NULL so
 * optional references never point at a record with an empty id.
 */
export type Absent = "null" | "omit" | "empty";
export type FieldSpec = { column: string; kind: ColumnKind; absent: Absent };
export type TableSpec = { table: string; fields: Record<string, FieldSpec> };

type Definition = [
  field: string,
  column: string,
  kind: ColumnKind,
  absent?: Absent,
];
const define = (table: string, definitions: Definition[]): TableSpec => ({
  table,
  fields: Object.fromEntries(
    definitions.map(([field, column, kind, absent = "null"]) => [
      field,
      { column, kind, absent },
    ]),
  ),
});

export const RECORD_TABLES = {
  farms: define("farms", [
    ["name", "name", "text"],
    ["district", "district", "text"],
    ["latitude", "latitude", "float"],
    ["longitude", "longitude", "float"],
    ["areaAcres", "area_acres", "float"],
    ["crop", "crop", "text"],
    ["plantedAt", "planted_at", "date"],
    ["ownerName", "owner_name", "text"],
    ["stage", "stage", "text"],
    ["notes", "notes", "text"],
  ]),
  tasks: define("tasks", [
    ["farmId", "farm_id", "text", "empty"],
    ["title", "title", "text"],
    ["dueDate", "due_date", "date"],
    ["category", "category", "text"],
    ["status", "status", "text"],
    ["notes", "notes", "text"],
    ["callbackRequestId", "callback_request_id", "text", "omit"],
  ]),
  contacts: define("contacts", [
    ["name", "name", "text"],
    ["phone", "phone", "text"],
    ["district", "district", "text"],
    ["type", "type", "text"],
    ["crop", "crop", "text"],
    ["stage", "stage", "text"],
    ["preferredChannel", "preferred_channel", "text"],
    ["consent", "consent", "boolean"],
    ["notes", "notes", "text"],
    ["consentChannels", "consent_channels", "text[]"],
    ["consentRecordedAt", "consent_recorded_at", "timestamptz"],
    ["consentSource", "consent_source", "text"],
    ["consentWithdrawnAt", "consent_withdrawn_at", "timestamptz", "omit"],
    ["lastInboundAt", "last_inbound_at", "jsonb"],
  ]),
  "market-prices": define("market_prices", [
    ["crop", "crop", "text"],
    ["market", "market", "text"],
    ["district", "district", "text"],
    ["priceUgx", "price_ugx", "float"],
    ["unit", "unit", "text"],
    ["observedAt", "observed_at", "timestamptz"],
    ["source", "source", "text"],
    ["status", "status", "text"],
  ]),
  offers: define("offers", [
    ["crop", "crop", "text"],
    ["quantityKg", "quantity_kg", "float"],
    ["priceUgx", "price_ugx", "float"],
    ["district", "district", "text"],
    ["sellerName", "seller_name", "text"],
    ["description", "description", "text"],
    ["status", "status", "text"],
  ]),
  deals: define("deals", [
    ["buyer", "buyer", "text"],
    ["crop", "crop", "text"],
    ["quantityKg", "quantity_kg", "float"],
    ["priceUgx", "price_ugx", "float"],
    ["destination", "destination", "text"],
    ["incoterm", "incoterm", "text"],
    ["stage", "stage", "text"],
    ["checklist", "checklist", "text[]"],
    ["notes", "notes", "text"],
  ]),
  reports: define("reports", [
    ["kind", "kind", "text"],
    ["district", "district", "text"],
    ["farmId", "farm_id", "text", "omit"],
    ["description", "description", "text"],
    ["status", "status", "text"],
    ["latitude", "latitude", "float", "omit"],
    ["longitude", "longitude", "float", "omit"],
  ]),
  progress: define("progress", [
    ["lessonId", "lesson_id", "text"],
    ["lessonVersion", "lesson_version", "integer"],
    ["completed", "completed", "boolean"],
    ["score", "score", "integer"],
  ]),
  settings: define("settings", [
    ["language", "language", "text"],
    ["lowDataMode", "low_data_mode", "boolean"],
    ["preferredChannel", "preferred_channel", "text"],
    ["notifications", "notifications", "boolean"],
  ]),
  messages: define("messages", [
    ["contactId", "contact_id", "text"],
    ["channel", "channel", "text"],
    ["body", "body", "text"],
    ["status", "status", "text"],
    ["dispatchState", "dispatch_state", "text"],
    ["providerId", "provider_id", "text", "omit"],
    ["error", "error", "text", "omit"],
    ["retryable", "retryable", "boolean", "omit"],
    ["deliveryUncertain", "delivery_uncertain", "boolean", "omit"],
    ["deliveryUpdatedAt", "delivery_updated_at", "timestamptz", "omit"],
  ]),
  seasons: define("seasons", [
    ["farmId", "farm_id", "text"],
    ["name", "name", "text"],
    ["crop", "crop", "text"],
    ["areaAcres", "area_acres", "float"],
    ["plantingDate", "planting_date", "date"],
    ["expectedHarvestDate", "expected_harvest_date", "date"],
    ["expectedHarvestKg", "expected_harvest_kg", "float"],
    ["reserveKg", "reserve_kg", "float"],
    ["expectedPriceUgx", "expected_price_ugx", "integer"],
    ["contingencyUgx", "contingency_ugx", "bigint"],
    ["status", "status", "text"],
    ["costs", "costs", "jsonb"],
    ["sales", "sales", "jsonb"],
    ["harvestedKg", "harvested_kg", "float"],
    ["notes", "notes", "text"],
  ]),
  lots: define("lots", [
    ["farmId", "farm_id", "text"],
    ["seasonId", "season_id", "text", "omit"],
    ["crop", "crop", "text"],
    ["harvestDate", "harvest_date", "date"],
    ["quantityKg", "quantity_kg", "float"],
    ["bagCount", "bag_count", "integer"],
    ["storageLocation", "storage_location", "text"],
    ["moisturePercent", "moisture_percent", "float"],
    ["measurementMethod", "measurement_method", "text"],
    ["testReference", "test_reference", "text"],
    ["qualityStatus", "quality_status", "text"],
    ["qualityNotes", "quality_notes", "text"],
    ["notes", "notes", "text"],
    ["lotCode", "lot_code", "text"],
    ["qualityReviewedBy", "quality_reviewed_by", "text"],
    ["qualityReviewedAt", "quality_reviewed_at", "timestamptz"],
  ]),
  collections: define("collections", [
    ["name", "name", "text"],
    ["crop", "crop", "text"],
    ["buyer", "buyer", "text"],
    ["dealId", "deal_id", "text", "omit"],
    ["targetKg", "target_kg", "float"],
    ["priceUgxPerKg", "price_ugx_per_kg", "integer"],
    ["collectionDate", "collection_date", "date"],
    ["meetingPoint", "meeting_point", "text"],
    ["destination", "destination", "text"],
    ["status", "status", "text"],
    ["lotIds", "lot_ids", "text[]"],
    ["notes", "notes", "text"],
    ["manifest", "manifest", "jsonb", "omit"],
  ]),
} satisfies Record<string, TableSpec>;

export type RecordType = keyof typeof RECORD_TABLES;
export const RECORD_TYPES = Object.keys(RECORD_TABLES) as RecordType[];
/** Columns every record table shares, in addition to its typed fields. */
export const RECORD_COLUMNS = [
  "id",
  "tenant_id",
  "owner_id",
  "version",
  "sample",
  "created_at",
  "updated_at",
] as const;

export type EntityRow = {
  id: string;
  type: string;
  tenant_id: string;
  owner_id: string;
  data: Record<string, any>;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

export function recordSpec(type: string): TableSpec {
  if (!Object.hasOwn(RECORD_TABLES, type))
    throw new Error(`Unknown record type: ${type}`);
  return RECORD_TABLES[type as RecordType];
}

const selectLists = new Map<string, string>();
/** Column list for SELECT/RETURNING, optionally qualified by a table alias. */
export function recordColumns(type: string, alias = "") {
  const key = `${type}:${alias}`;
  const cached = selectLists.get(key);
  if (cached) return cached;
  const prefix = alias ? `${alias}.` : "";
  const list = [
    ...RECORD_COLUMNS.map((column) => `${prefix}${column}`),
    ...Object.values(recordSpec(type).fields).map(({ column, kind }) =>
      // Calendar dates stay plain strings; drivers would otherwise apply a
      // local time zone to them.
      kind === "date"
        ? `to_char(${prefix}${column},'YYYY-MM-DD') AS ${column}`
        : `${prefix}${column}`,
    ),
  ].join(",");
  selectLists.set(key, list);
  return list;
}

function readValue(kind: ColumnKind, value: any) {
  if (kind === "timestamptz") return new Date(value).toISOString();
  // node-postgres returns int8 as a string; values are validated to stay safe.
  if (kind === "bigint") return Number(value);
  return value;
}

export function toEntityRow(type: string, row: Record<string, any>) {
  const data: Record<string, any> = {};
  for (const [field, { column, kind, absent }] of Object.entries(
    recordSpec(type).fields,
  )) {
    const value = row[column];
    if (value === null || value === undefined) {
      if (absent === "null") data[field] = null;
      else if (absent === "empty") data[field] = "";
    } else data[field] = readValue(kind, value);
  }
  if (row.sample) data.sample = true;
  return {
    id: row.id,
    type,
    tenant_id: row.tenant_id,
    owner_id: row.owner_id,
    data,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  } satisfies EntityRow;
}

const casts: Partial<Record<ColumnKind, string>> = {
  date: "::date",
  timestamptz: "::timestamptz",
  jsonb: "::jsonb",
  "text[]": "::text[]",
};
/** Converts API fields to [column, cast, value] triples; rejects unknown fields. */
function columnValues(type: string, data: Record<string, unknown>) {
  const { fields } = recordSpec(type);
  return Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => {
      const spec = fields[field];
      if (!spec)
        throw new Error(
          `Record field ${type}.${field} has no column. Add a migration and registry entry.`,
        );
      const stored =
        value === "" && spec.absent !== "null"
          ? null
          : spec.kind === "jsonb" && value !== null
            ? JSON.stringify(value)
            : value;
      return [spec.column, casts[spec.kind] || "", stored] as const;
    });
}

/** Typed SELECT. `where` and `suffix` use column names and $n parameters. */
export async function selectRecords(
  db: Queryable,
  type: string,
  where: string,
  values: unknown[],
  suffix = "",
) {
  const { rows } = await db.query(
    `SELECT ${recordColumns(type)} FROM ${recordSpec(type).table} WHERE ${where}${suffix ? ` ${suffix}` : ""}`,
    values,
  );
  return rows.map((row) => toEntityRow(type, row));
}

export async function insertRecord(
  db: Queryable,
  type: string,
  record: {
    id?: string;
    tenantId: string;
    ownerId: string;
    data: Record<string, unknown>;
  },
  options: { ignoreConflict?: boolean } = {},
): Promise<EntityRow | undefined> {
  const { sample, ...data } = record.data;
  const columns = [
    ["id", "", record.id || randomUUID()],
    ["tenant_id", "", record.tenantId],
    ["owner_id", "", record.ownerId],
    ["sample", "", sample === true],
    ...columnValues(type, data),
  ] as const;
  const { rows } = await db.query(
    `INSERT INTO ${recordSpec(type).table}(${columns.map(([column]) => column).join(",")}) VALUES(${columns.map(([, cast], index) => `$${index + 1}${cast}`).join(",")})${options.ignoreConflict ? " ON CONFLICT DO NOTHING" : ""} RETURNING ${recordColumns(type)}`,
    columns.map(([, , value]) => value),
  );
  return rows[0] ? toEntityRow(type, rows[0]) : undefined;
}

/**
 * Updates the supplied fields only. By default the version increases and a
 * stale `expectedVersion` or failed `where` match returns undefined.
 */
export async function updateRecord(
  db: Queryable,
  type: string,
  key: { id: string; tenantId: string },
  data: Record<string, unknown>,
  options: {
    expectedVersion?: number;
    bumpVersion?: boolean;
    where?: Record<string, unknown>;
  } = {},
): Promise<EntityRow | undefined> {
  const assignments = columnValues(type, data);
  const conditions = columnValues(type, options.where || {});
  const values: unknown[] = [key.id, key.tenantId];
  const parameter = (cast: string, value: unknown) => {
    values.push(value);
    return `$${values.length}${cast}`;
  };
  const set = assignments.map(
    ([column, cast, value]) => `${column}=${parameter(cast, value)}`,
  );
  if (options.bumpVersion !== false)
    set.push("version=version+1", "updated_at=now()");
  if (!set.length) throw new Error("An update needs at least one field.");
  const where = ["id=$1", "tenant_id=$2"];
  if (options.expectedVersion !== undefined)
    where.push(`version=${parameter("", options.expectedVersion)}`);
  for (const [column, cast, value] of conditions)
    where.push(
      value === null
        ? `${column} IS NULL`
        : `${column}=${parameter(cast, value)}`,
    );
  const { rows } = await db.query(
    `UPDATE ${recordSpec(type).table} SET ${set.join(",")} WHERE ${where.join(" AND ")} RETURNING ${recordColumns(type)}`,
    values,
  );
  return rows[0] ? toEntityRow(type, rows[0]) : undefined;
}

/** Record counts per type for one organization. */
export async function countRecords(db: Queryable, tenantId: string) {
  const { rows } = await db.query<{ type: string; count: number }>(
    RECORD_TYPES.map(
      (type) =>
        `SELECT '${type}' AS type,count(*)::integer AS count FROM ${RECORD_TABLES[type].table} WHERE tenant_id=$1`,
    ).join(" UNION ALL "),
    [tenantId],
  );
  return Object.fromEntries(rows.map((row) => [row.type, row.count]));
}
