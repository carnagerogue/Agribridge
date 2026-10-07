import type { Migration } from "./runner.js";

/*
 * Moves every operational record out of the generic `entities` JSON table into
 * one typed table per record type. Constants below are part of this migration's
 * checksum: never change them; write a new migration instead.
 *
 * Safety properties, all inside one transaction:
 * - A legacy record with an unknown type or field aborts the migration, so no
 *   value is silently dropped. Nothing changes until the cause is resolved.
 * - Each value is cast to its column type and checked by constraints; malformed
 *   legacy data aborts rather than being coerced.
 * - Row counts are compared before the legacy table is removed.
 * - Cross-record references use (tenant_id, id) foreign keys, so the database
 *   itself rejects a reference to another organization's record.
 * - An older release cannot start against the upgraded database.
 */

const record = `id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK (version > 0), sample boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, id)`;
const recordColumns = `id,tenant_id,owner_id,version,sample,created_at,updated_at`;
const recordValues = `id,tenant_id,owner_id,version,COALESCE((data->>'sample')::boolean,false),created_at,updated_at`;
// JSON null and a missing key both become the column default.
const json = (key: string, fallback: string) =>
  `COALESCE(NULLIF(data->'${key}','null'::jsonb),'${fallback}'::jsonb)`;
const textArray = (key: string) =>
  `ARRAY(SELECT jsonb_array_elements_text(${json(key, "[]")}))`;

const legacyFields: Record<string, string[]> = {
  farms: [
    "name",
    "district",
    "latitude",
    "longitude",
    "areaAcres",
    "crop",
    "plantedAt",
    "ownerName",
    "stage",
    "notes",
  ],
  tasks: [
    "farmId",
    "title",
    "dueDate",
    "category",
    "status",
    "notes",
    "callbackRequestId",
  ],
  contacts: [
    "name",
    "phone",
    "district",
    "type",
    "crop",
    "stage",
    "preferredChannel",
    "consent",
    "notes",
    "consentChannels",
    "consentRecordedAt",
    "consentSource",
    "consentWithdrawnAt",
    "lastInboundAt",
  ],
  "market-prices": [
    "crop",
    "market",
    "district",
    "priceUgx",
    "unit",
    "observedAt",
    "source",
    "status",
  ],
  offers: [
    "crop",
    "quantityKg",
    "priceUgx",
    "district",
    "sellerName",
    "description",
    "status",
  ],
  deals: [
    "buyer",
    "crop",
    "quantityKg",
    "priceUgx",
    "destination",
    "incoterm",
    "stage",
    "checklist",
    "notes",
  ],
  reports: [
    "kind",
    "district",
    "farmId",
    "description",
    "status",
    "latitude",
    "longitude",
  ],
  progress: ["lessonId", "lessonVersion", "completed", "score"],
  settings: ["language", "lowDataMode", "preferredChannel", "notifications"],
  messages: [
    "contactId",
    "channel",
    "body",
    "status",
    "dispatchState",
    "providerId",
    "error",
    "retryable",
    "deliveryUncertain",
    "deliveryUpdatedAt",
  ],
  seasons: [
    "farmId",
    "name",
    "crop",
    "areaAcres",
    "plantingDate",
    "expectedHarvestDate",
    "expectedHarvestKg",
    "reserveKg",
    "expectedPriceUgx",
    "contingencyUgx",
    "status",
    "costs",
    "sales",
    "harvestedKg",
    "notes",
  ],
  lots: [
    "farmId",
    "seasonId",
    "crop",
    "harvestDate",
    "quantityKg",
    "bagCount",
    "storageLocation",
    "moisturePercent",
    "measurementMethod",
    "testReference",
    "qualityStatus",
    "qualityNotes",
    "notes",
    "lotCode",
    "qualityReviewedBy",
    "qualityReviewedAt",
  ],
  collections: [
    "name",
    "crop",
    "buyer",
    "dealId",
    "targetKg",
    "priceUgxPerKg",
    "collectionDate",
    "meetingPoint",
    "destination",
    "status",
    "lotIds",
    "notes",
    "manifest",
  ],
};
const allowedKeys = Object.entries(legacyFields)
  .map(
    ([type, fields]) =>
      `WHEN '${type}' THEN ARRAY['${[...fields, "sample"].join("','")}']`,
  )
  .join(" ");
const knownTypes = `'${Object.keys(legacyFields).join("','")}'`;

export const typedRecords: Migration = {
  version: 2,
  name: "typed_records",
  statements: [
    // Refuse to continue if any legacy value would have nowhere to go.
    `DO $$ DECLARE problem text; BEGIN
      SELECT 'record type "' || type || '"' INTO problem FROM entities WHERE type NOT IN (${knownTypes}) LIMIT 1;
      IF problem IS NULL THEN
        SELECT 'field "' || e.type || '.' || k || '" on record ' || e.id INTO problem
        FROM entities e, jsonb_object_keys(e.data) AS k
        WHERE NOT (k = ANY (CASE e.type ${allowedKeys} END)) LIMIT 1;
      END IF;
      IF problem IS NOT NULL THEN
        RAISE EXCEPTION 'Typed-record migration stopped: unmapped legacy %. No data was changed; add a column mapping in a corrected migration before upgrading.', problem;
      END IF;
    END $$`,

    `CREATE TABLE farms (${record}, name text NOT NULL, district text NOT NULL, latitude double precision NOT NULL, longitude double precision NOT NULL, area_acres double precision NOT NULL CHECK (area_acres > 0), crop text NOT NULL, planted_at date NOT NULL, owner_name text NOT NULL, stage text NOT NULL CHECK (stage IN ('planning','planted','growing','harvesting','fallow')), notes text NOT NULL DEFAULT '')`,
    `CREATE TABLE contacts (${record}, name text NOT NULL, phone text NOT NULL, district text NOT NULL, type text NOT NULL CHECK (type IN ('farmer','buyer','cooperative','supplier')), crop text NOT NULL, stage text NOT NULL CHECK (stage IN ('new','active','follow_up')), preferred_channel text NOT NULL CHECK (preferred_channel IN ('sms','whatsapp','voice','ussd')), consent boolean NOT NULL, notes text NOT NULL DEFAULT '', consent_channels text[] NOT NULL DEFAULT '{}' CHECK (consent_channels <@ ARRAY['sms','whatsapp','voice','ussd']), consent_recorded_at timestamptz, consent_source text, consent_withdrawn_at timestamptz, last_inbound_at jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(last_inbound_at) = 'object'))`,
    `CREATE TABLE market_prices (${record}, crop text NOT NULL, market text NOT NULL, district text NOT NULL, price_ugx double precision NOT NULL CHECK (price_ugx > 0), unit text NOT NULL DEFAULT 'kg' CHECK (unit = 'kg'), observed_at timestamptz NOT NULL, source text NOT NULL, status text NOT NULL CHECK (status IN ('sample','reported','verified')))`,
    `CREATE TABLE offers (${record}, crop text NOT NULL, quantity_kg double precision NOT NULL CHECK (quantity_kg > 0), price_ugx double precision NOT NULL CHECK (price_ugx > 0), district text NOT NULL, seller_name text NOT NULL, description text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold')))`,
    `CREATE TABLE deals (${record}, buyer text NOT NULL, crop text NOT NULL, quantity_kg double precision NOT NULL CHECK (quantity_kg > 0), price_ugx double precision NOT NULL CHECK (price_ugx > 0), destination text NOT NULL, incoterm text NOT NULL CHECK (incoterm IN ('EXW','FCA','FOB','CIF','DAP')), stage text NOT NULL CHECK (stage IN ('inquiry','qualified','contracted','in_transit','delivered')), checklist text[] NOT NULL DEFAULT '{}', notes text NOT NULL DEFAULT '')`,
    `CREATE TABLE tasks (${record}, farm_id text, title text NOT NULL, due_date date NOT NULL, category text NOT NULL CHECK (category IN ('planting','watering','scouting','harvest','learning','follow_up','general')), status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')), notes text NOT NULL DEFAULT '', callback_request_id text, FOREIGN KEY (tenant_id, farm_id) REFERENCES farms(tenant_id, id))`,
    `CREATE TABLE reports (${record}, kind text NOT NULL CHECK (kind IN ('crop_pest','crop_disease','standing_water')), district text NOT NULL, farm_id text, description text NOT NULL, status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','resolved')), latitude double precision, longitude double precision, FOREIGN KEY (tenant_id, farm_id) REFERENCES farms(tenant_id, id))`,
    `CREATE TABLE progress (${record}, lesson_id text NOT NULL, lesson_version integer NOT NULL DEFAULT 1 CHECK (lesson_version > 0), completed boolean NOT NULL, score integer NOT NULL CHECK (score BETWEEN 0 AND 100), UNIQUE (tenant_id, owner_id, lesson_id))`,
    `CREATE TABLE settings (${record}, language text NOT NULL CHECK (language IN ('en','lg','sw')), low_data_mode boolean NOT NULL, preferred_channel text NOT NULL CHECK (preferred_channel IN ('sms','whatsapp','voice','ussd')), notifications boolean NOT NULL, UNIQUE (tenant_id, owner_id))`,
    `CREATE TABLE messages (${record}, contact_id text NOT NULL, channel text NOT NULL CHECK (channel IN ('sms','whatsapp')), body text NOT NULL, status text NOT NULL CHECK (status IN ('queued','sent','delivered','failed','not_configured')), dispatch_state text NOT NULL CHECK (dispatch_state IN ('reserved','sending','finished')), provider_id text, error text, retryable boolean, delivery_uncertain boolean, delivery_updated_at timestamptz, FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id))`,
    `CREATE TABLE seasons (${record}, farm_id text NOT NULL, name text NOT NULL, crop text NOT NULL, area_acres double precision NOT NULL CHECK (area_acres > 0), planting_date date NOT NULL, expected_harvest_date date NOT NULL, expected_harvest_kg double precision NOT NULL CHECK (expected_harvest_kg >= 0), reserve_kg double precision NOT NULL DEFAULT 0 CHECK (reserve_kg >= 0), expected_price_ugx integer NOT NULL CHECK (expected_price_ugx >= 0), contingency_ugx bigint NOT NULL DEFAULT 0 CHECK (contingency_ugx >= 0), status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','closed')), costs jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(costs) = 'array'), sales jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sales) = 'array'), harvested_kg double precision NOT NULL DEFAULT 0 CHECK (harvested_kg >= 0), notes text NOT NULL DEFAULT '', CHECK (expected_harvest_date >= planting_date), CHECK (reserve_kg <= expected_harvest_kg), FOREIGN KEY (tenant_id, farm_id) REFERENCES farms(tenant_id, id))`,
    `CREATE TABLE lots (${record}, farm_id text NOT NULL, season_id text, crop text NOT NULL, harvest_date date NOT NULL, quantity_kg double precision NOT NULL CHECK (quantity_kg > 0), bag_count integer NOT NULL CHECK (bag_count >= 0), storage_location text NOT NULL, moisture_percent double precision CHECK (moisture_percent BETWEEN 0 AND 100), measurement_method text NOT NULL DEFAULT 'not_recorded' CHECK (measurement_method IN ('not_recorded','meter','lab_report','other')), test_reference text NOT NULL DEFAULT '', quality_status text NOT NULL DEFAULT 'unassessed' CHECK (quality_status IN ('unassessed','pending_test','accepted','on_hold','rejected')), quality_notes text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', lot_code text NOT NULL, quality_reviewed_by text, quality_reviewed_at timestamptz, UNIQUE (tenant_id, lot_code), FOREIGN KEY (tenant_id, farm_id) REFERENCES farms(tenant_id, id), FOREIGN KEY (tenant_id, season_id) REFERENCES seasons(tenant_id, id))`,
    `CREATE TABLE collections (${record}, name text NOT NULL, crop text NOT NULL, buyer text NOT NULL, deal_id text, target_kg double precision NOT NULL CHECK (target_kg > 0), price_ugx_per_kg integer NOT NULL CHECK (price_ugx_per_kg >= 0), collection_date date NOT NULL, meeting_point text NOT NULL, destination text NOT NULL, status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','confirmed','dispatched','cancelled')), lot_ids text[] NOT NULL DEFAULT '{}', notes text NOT NULL DEFAULT '', manifest jsonb CHECK (jsonb_typeof(manifest) = 'array'), FOREIGN KEY (tenant_id, deal_id) REFERENCES deals(tenant_id, id))`,

    // Listing order and owner scoping used by every list endpoint.
    ...[
      "farms",
      "contacts",
      "market_prices",
      "offers",
      "deals",
      "tasks",
      "reports",
      "progress",
      "messages",
      "seasons",
      "lots",
      "collections",
    ].flatMap((table) => [
      `CREATE INDEX ${table}_list_idx ON ${table}(tenant_id, created_at DESC, id)`,
      `CREATE INDEX ${table}_owner_idx ON ${table}(tenant_id, owner_id, created_at DESC, id)`,
    ]),
    `CREATE INDEX contacts_phone_idx ON contacts(tenant_id, phone, created_at, id)`,
    `CREATE INDEX market_prices_lookup_idx ON market_prices(tenant_id, district, status, observed_at DESC)`,
    `CREATE INDEX tasks_farm_idx ON tasks(tenant_id, farm_id) WHERE farm_id IS NOT NULL`,
    `CREATE INDEX reports_farm_idx ON reports(tenant_id, farm_id) WHERE farm_id IS NOT NULL`,
    `CREATE INDEX messages_contact_idx ON messages(tenant_id, contact_id)`,
    `CREATE INDEX messages_provider_idx ON messages(tenant_id, provider_id) WHERE provider_id IS NOT NULL`,
    `CREATE INDEX seasons_farm_idx ON seasons(tenant_id, farm_id)`,
    `CREATE INDEX lots_farm_idx ON lots(tenant_id, farm_id)`,
    `CREATE INDEX lots_season_idx ON lots(tenant_id, season_id) WHERE season_id IS NOT NULL`,
    `CREATE INDEX collections_deal_idx ON collections(tenant_id, deal_id) WHERE deal_id IS NOT NULL`,

    // Backfill parents before children so every foreign key is checked.
    `INSERT INTO farms(${recordColumns},name,district,latitude,longitude,area_acres,crop,planted_at,owner_name,stage,notes)
      SELECT ${recordValues},data->>'name',data->>'district',(data->>'latitude')::double precision,(data->>'longitude')::double precision,(data->>'areaAcres')::double precision,data->>'crop',(data->>'plantedAt')::date,data->>'ownerName',data->>'stage',COALESCE(data->>'notes','')
      FROM entities WHERE type='farms'`,
    `INSERT INTO contacts(${recordColumns},name,phone,district,type,crop,stage,preferred_channel,consent,notes,consent_channels,consent_recorded_at,consent_source,consent_withdrawn_at,last_inbound_at)
      SELECT ${recordValues},data->>'name',data->>'phone',data->>'district',data->>'type',data->>'crop',data->>'stage',data->>'preferredChannel',(data->>'consent')::boolean,COALESCE(data->>'notes',''),${textArray("consentChannels")},(data->>'consentRecordedAt')::timestamptz,data->>'consentSource',(data->>'consentWithdrawnAt')::timestamptz,${json("lastInboundAt", "{}")}
      FROM entities WHERE type='contacts'`,
    `INSERT INTO market_prices(${recordColumns},crop,market,district,price_ugx,unit,observed_at,source,status)
      SELECT ${recordValues},data->>'crop',data->>'market',data->>'district',(data->>'priceUgx')::double precision,COALESCE(data->>'unit','kg'),(data->>'observedAt')::timestamptz,data->>'source',data->>'status'
      FROM entities WHERE type='market-prices'`,
    `INSERT INTO offers(${recordColumns},crop,quantity_kg,price_ugx,district,seller_name,description,status)
      SELECT ${recordValues},data->>'crop',(data->>'quantityKg')::double precision,(data->>'priceUgx')::double precision,data->>'district',data->>'sellerName',COALESCE(data->>'description',''),COALESCE(data->>'status','available')
      FROM entities WHERE type='offers'`,
    `INSERT INTO deals(${recordColumns},buyer,crop,quantity_kg,price_ugx,destination,incoterm,stage,checklist,notes)
      SELECT ${recordValues},data->>'buyer',data->>'crop',(data->>'quantityKg')::double precision,(data->>'priceUgx')::double precision,data->>'destination',data->>'incoterm',data->>'stage',${textArray("checklist")},COALESCE(data->>'notes','')
      FROM entities WHERE type='deals'`,
    `INSERT INTO tasks(${recordColumns},farm_id,title,due_date,category,status,notes,callback_request_id)
      SELECT ${recordValues},NULLIF(data->>'farmId',''),data->>'title',(data->>'dueDate')::date,data->>'category',COALESCE(data->>'status','pending'),COALESCE(data->>'notes',''),data->>'callbackRequestId'
      FROM entities WHERE type='tasks'`,
    `INSERT INTO reports(${recordColumns},kind,district,farm_id,description,status,latitude,longitude)
      SELECT ${recordValues},data->>'kind',data->>'district',NULLIF(data->>'farmId',''),data->>'description',COALESCE(data->>'status','submitted'),(data->>'latitude')::double precision,(data->>'longitude')::double precision
      FROM entities WHERE type='reports'`,
    `INSERT INTO progress(${recordColumns},lesson_id,lesson_version,completed,score)
      SELECT ${recordValues},data->>'lessonId',COALESCE((data->>'lessonVersion')::integer,1),(data->>'completed')::boolean,(data->>'score')::integer
      FROM entities WHERE type='progress'`,
    `INSERT INTO settings(${recordColumns},language,low_data_mode,preferred_channel,notifications)
      SELECT ${recordValues},data->>'language',(data->>'lowDataMode')::boolean,data->>'preferredChannel',(data->>'notifications')::boolean
      FROM entities WHERE type='settings'`,
    `INSERT INTO messages(${recordColumns},contact_id,channel,body,status,dispatch_state,provider_id,error,retryable,delivery_uncertain,delivery_updated_at)
      SELECT ${recordValues},data->>'contactId',data->>'channel',data->>'body',data->>'status',data->>'dispatchState',data->>'providerId',data->>'error',(data->>'retryable')::boolean,(data->>'deliveryUncertain')::boolean,(data->>'deliveryUpdatedAt')::timestamptz
      FROM entities WHERE type='messages'`,
    `INSERT INTO seasons(${recordColumns},farm_id,name,crop,area_acres,planting_date,expected_harvest_date,expected_harvest_kg,reserve_kg,expected_price_ugx,contingency_ugx,status,costs,sales,harvested_kg,notes)
      SELECT ${recordValues},data->>'farmId',data->>'name',data->>'crop',(data->>'areaAcres')::double precision,(data->>'plantingDate')::date,(data->>'expectedHarvestDate')::date,(data->>'expectedHarvestKg')::double precision,COALESCE((data->>'reserveKg')::double precision,0),(data->>'expectedPriceUgx')::integer,COALESCE((data->>'contingencyUgx')::bigint,0),COALESCE(data->>'status','planning'),${json("costs", "[]")},${json("sales", "[]")},COALESCE((data->>'harvestedKg')::double precision,0),COALESCE(data->>'notes','')
      FROM entities WHERE type='seasons'`,
    `INSERT INTO lots(${recordColumns},farm_id,season_id,crop,harvest_date,quantity_kg,bag_count,storage_location,moisture_percent,measurement_method,test_reference,quality_status,quality_notes,notes,lot_code,quality_reviewed_by,quality_reviewed_at)
      SELECT ${recordValues},data->>'farmId',NULLIF(data->>'seasonId',''),data->>'crop',(data->>'harvestDate')::date,(data->>'quantityKg')::double precision,(data->>'bagCount')::integer,data->>'storageLocation',(data->>'moisturePercent')::double precision,COALESCE(data->>'measurementMethod','not_recorded'),COALESCE(data->>'testReference',''),COALESCE(data->>'qualityStatus','unassessed'),COALESCE(data->>'qualityNotes',''),COALESCE(data->>'notes',''),data->>'lotCode',data->>'qualityReviewedBy',(data->>'qualityReviewedAt')::timestamptz
      FROM entities WHERE type='lots'`,
    `INSERT INTO collections(${recordColumns},name,crop,buyer,deal_id,target_kg,price_ugx_per_kg,collection_date,meeting_point,destination,status,lot_ids,notes,manifest)
      SELECT ${recordValues},data->>'name',data->>'crop',data->>'buyer',NULLIF(data->>'dealId',''),(data->>'targetKg')::double precision,(data->>'priceUgxPerKg')::integer,(data->>'collectionDate')::date,data->>'meetingPoint',data->>'destination',COALESCE(data->>'status','planning'),${textArray("lotIds")},COALESCE(data->>'notes',''),NULLIF(data->'manifest','null'::jsonb)
      FROM entities WHERE type='collections'`,

    `DO $$ BEGIN
      IF (SELECT count(*) FROM entities) <> (SELECT (SELECT count(*) FROM farms)+(SELECT count(*) FROM contacts)+(SELECT count(*) FROM market_prices)+(SELECT count(*) FROM offers)+(SELECT count(*) FROM deals)+(SELECT count(*) FROM tasks)+(SELECT count(*) FROM reports)+(SELECT count(*) FROM progress)+(SELECT count(*) FROM settings)+(SELECT count(*) FROM messages)+(SELECT count(*) FROM seasons)+(SELECT count(*) FROM lots)+(SELECT count(*) FROM collections)) THEN
        RAISE EXCEPTION 'Typed-record migration stopped: copied record count does not match the legacy table. No data was changed.';
      END IF;
    END $$`,

    // Allocations now reference the typed lot and collection within the same tenant.
    `ALTER TABLE lot_allocations DROP CONSTRAINT IF EXISTS lot_allocations_lot_id_fkey`,
    `ALTER TABLE lot_allocations DROP CONSTRAINT IF EXISTS lot_allocations_collection_id_fkey`,
    `ALTER TABLE lot_allocations ADD CONSTRAINT lot_allocations_lot_fkey FOREIGN KEY (tenant_id, lot_id) REFERENCES lots(tenant_id, id)`,
    `ALTER TABLE lot_allocations ADD CONSTRAINT lot_allocations_collection_fkey FOREIGN KEY (tenant_id, collection_id) REFERENCES collections(tenant_id, id)`,
    `DROP TABLE entities`,
    // Releases before versioned migrations would recreate an empty `entities`
    // table and appear to have lost every record. This empty view makes their
    // startup schema routine fail instead (an index cannot be built on a view).
    // Rolling back past this migration means restoring the pre-upgrade backup.
    `CREATE VIEW entities AS SELECT NULL::text AS retired_by_migration_2 WHERE false`,
    `COMMENT ON VIEW entities IS 'Retired by Agribridge migration 2 (typed_records). Records now live in one table per type. Do not use.'`,
  ],
};
