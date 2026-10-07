import type { Migration } from "./runner.js";

/**
 * The schema as it existed before versioned migrations. Every statement is
 * idempotent so databases created by the earlier create-if-missing startup
 * routine adopt this version without changes. Never edit an applied migration;
 * add a new one instead. The runner rejects a changed checksum.
 */
export const baseline: Migration = {
  version: 1,
  name: "baseline",
  statements: [
    `CREATE TABLE IF NOT EXISTS organizations (id text PRIMARY KEY, name text NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), name text NOT NULL, email text UNIQUE, password_hash text, role text NOT NULL CHECK(role IN ('farmer','operator','admin')), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text UNIQUE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false`,
    `CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), csrf_token text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)`,
    `CREATE TABLE IF NOT EXISTS entities (id text PRIMARY KEY, type text NOT NULL, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL REFERENCES users(id), data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS entities_scope_idx ON entities(tenant_id,type,owner_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS entities_personal_idx ON entities(tenant_id,owner_id,type,(data->>'lessonId')) WHERE type = 'progress'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS entities_settings_idx ON entities(tenant_id,owner_id,type) WHERE type = 'settings'`,
    `CREATE TABLE IF NOT EXISTS audit_events (id text PRIMARY KEY, tenant_id text NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL, action text NOT NULL, entity_type text NOT NULL, entity_id text, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE INDEX IF NOT EXISTS audit_scope_idx ON audit_events(tenant_id,created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS idempotency (tenant_id text NOT NULL, user_id text NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, status integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,user_id,key))`,
    `CREATE TABLE IF NOT EXISTS channel_events (provider text NOT NULL, event_id text NOT NULL, response text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,event_id))`,
    `CREATE TABLE IF NOT EXISTS channel_deliveries (tenant_id text NOT NULL, provider_id text NOT NULL, status text NOT NULL, occurred_at timestamptz NOT NULL, PRIMARY KEY(tenant_id,provider_id))`,
    `CREATE TABLE IF NOT EXISTS ai_daily_usage (scope text NOT NULL, day text NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY(scope,day))`,
    `CREATE TABLE IF NOT EXISTS messaging_daily_usage (scope text NOT NULL, day text NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY(scope,day))`,
    `CREATE TABLE IF NOT EXISTS lesson_editions (tenant_id text NOT NULL REFERENCES organizations(id), lesson_id text NOT NULL, data jsonb NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,lesson_id))`,
    `CREATE TABLE IF NOT EXISTS lesson_history (tenant_id text NOT NULL REFERENCES organizations(id), lesson_id text NOT NULL, version integer NOT NULL, data jsonb NOT NULL, actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,lesson_id,version))`,
    `CREATE TABLE IF NOT EXISTS lot_allocations (tenant_id text NOT NULL REFERENCES organizations(id), lot_id text NOT NULL REFERENCES entities(id), collection_id text NOT NULL REFERENCES entities(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,lot_id))`,
    `CREATE INDEX IF NOT EXISTS lot_collection_idx ON lot_allocations(tenant_id,collection_id)`,
    `CREATE TABLE IF NOT EXISTS whatsapp_threads (tenant_id text NOT NULL REFERENCES organizations(id),from_number text NOT NULL,last_request_at timestamptz,last_stop_at timestamptz,PRIMARY KEY(tenant_id,from_number))`,
    `CREATE TABLE IF NOT EXISTS whatsapp_inbox (id text PRIMARY KEY,tenant_id text NOT NULL REFERENCES organizations(id),provider_event_id text NOT NULL,from_number text NOT NULL,contact_id text,body text,content_type text NOT NULL,command text NOT NULL,occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,sample boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,provider_event_id))`,
    `CREATE INDEX IF NOT EXISTS whatsapp_inbox_page_idx ON whatsapp_inbox(tenant_id,received_at DESC,id DESC)`,
    `ALTER TABLE whatsapp_inbox ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false`,
    `CREATE INDEX IF NOT EXISTS whatsapp_inbox_phone_idx ON whatsapp_inbox(tenant_id,from_number,id)`,
    `CREATE INDEX IF NOT EXISTS whatsapp_inbox_expiry_idx ON whatsapp_inbox(tenant_id,expires_at) WHERE body IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS whatsapp_replies (id text PRIMARY KEY,tenant_id text NOT NULL REFERENCES organizations(id),inbox_id text NOT NULL REFERENCES whatsapp_inbox(id),actor_id text NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,request_hash text NOT NULL,body text,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'queued',provider_id text,error text,delivery_uncertain boolean NOT NULL DEFAULT true,sample boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,actor_id,idempotency_key))`,
    `CREATE INDEX IF NOT EXISTS whatsapp_replies_inbox_idx ON whatsapp_replies(tenant_id,inbox_id,created_at DESC,id DESC)`,
    `CREATE INDEX IF NOT EXISTS whatsapp_replies_provider_idx ON whatsapp_replies(tenant_id,provider_id) WHERE provider_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS whatsapp_replies_expiry_idx ON whatsapp_replies(tenant_id,expires_at) WHERE body IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS whatsapp_replies_pending_idx ON whatsapp_replies(tenant_id,inbox_id) WHERE delivery_uncertain=true OR status='queued'`,
    `CREATE TABLE IF NOT EXISTS market_data_sources (id text PRIMARY KEY,generation_id text,source_hash text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,last_success_at timestamptz,last_attempt_at timestamptz,next_refresh_at timestamptz,lease_until timestamptz,lease_token text,failure_count integer NOT NULL DEFAULT 0,last_error text)`,
    `CREATE TABLE IF NOT EXISTS market_observations (source_id text NOT NULL REFERENCES market_data_sources(id),series_id text NOT NULL,observed_at text NOT NULL,commodity text NOT NULL,market text NOT NULL,price_type text NOT NULL,unit text NOT NULL,currency text NOT NULL,data jsonb NOT NULL,raw_fields jsonb NOT NULL,row_hash text NOT NULL,PRIMARY KEY(source_id,series_id))`,
    `CREATE INDEX IF NOT EXISTS market_observation_filter_idx ON market_observations(source_id,commodity,market,price_type)`,
    `CREATE INDEX IF NOT EXISTS market_observation_date_idx ON market_observations(source_id,observed_at DESC,commodity,market,series_id)`,
    `CREATE TABLE IF NOT EXISTS market_data_imports (id text PRIMARY KEY,source_id text NOT NULL REFERENCES market_data_sources(id),source_hash text,status text NOT NULL,record_count integer NOT NULL DEFAULT 0,series_count integer NOT NULL DEFAULT 0,error text,started_at timestamptz NOT NULL,finished_at timestamptz NOT NULL)`,
  ],
};
