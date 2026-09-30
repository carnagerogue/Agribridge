import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";

export interface Queryable {
  query<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (db: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDatabase(
  config: Pick<AppConfig, "databaseUrl" | "databasePath"> &
    Partial<Pick<AppConfig, "databaseTls" | "databaseCa">>,
): Promise<Database> {
  if (config.databaseUrl) {
    const connection = new URL(config.databaseUrl);
    if (config.databaseTls)
      for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
        connection.searchParams.delete(parameter);
    const pool = new pg.Pool({
      connectionString: connection.toString(),
      ...(config.databaseTls
        ? {
            ssl: {
              rejectUnauthorized: true,
              ...(config.databaseCa ? { ca: config.databaseCa } : {}),
            },
          }
        : {}),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
      async query<T>(sql: string, values: unknown[] = []) {
        const result = await client.query(sql, values);
        return { rows: result.rows as T[], rowCount: result.rowCount || 0 };
      },
    });
    return {
      ...wrap(pool),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await fn(wrap(client));
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }
  if (config.databasePath !== ":memory:")
    await mkdir(path.dirname(path.resolve(config.databasePath)), {
      recursive: true,
      mode: 0o700,
    });
  const local = new PGlite(
    config.databasePath === ":memory:" ? undefined : config.databasePath,
  );
  await local.waitReady;
  const wrap = (client: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, values: unknown[] = []) {
      const result = await client.query<T>(sql, values);
      return {
        rows: result.rows,
        rowCount: result.affectedRows || result.rows.length,
      };
    },
  });
  return {
    ...wrap(local),
    transaction: (fn) =>
      local.transaction((tx) => fn(wrap(tx as unknown as PGlite))),
    close: () => local.close(),
  };
}

export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query(
      `CREATE TABLE IF NOT EXISTS organizations (id text PRIMARY KEY, name text NOT NULL)`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), name text NOT NULL, email text UNIQUE, password_hash text, role text NOT NULL CHECK(role IN ('farmer','operator','admin')), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await tx.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text UNIQUE`,
    );
    await tx.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_change_required boolean NOT NULL DEFAULT false`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), csrf_token text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS entities (id text PRIMARY KEY, type text NOT NULL, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL REFERENCES users(id), data jsonb NOT NULL, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS entities_scope_idx ON entities(tenant_id,type,owner_id)`,
    );
    await tx.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS entities_personal_idx ON entities(tenant_id,owner_id,type,(data->>'lessonId')) WHERE type = 'progress'`,
    );
    await tx.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS entities_settings_idx ON entities(tenant_id,owner_id,type) WHERE type = 'settings'`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS audit_events (id text PRIMARY KEY, tenant_id text NOT NULL, actor_id text NOT NULL, actor_name text NOT NULL, action text NOT NULL, entity_type text NOT NULL, entity_id text, created_at timestamptz NOT NULL DEFAULT now())`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS audit_scope_idx ON audit_events(tenant_id,created_at DESC)`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS idempotency (tenant_id text NOT NULL, user_id text NOT NULL, key text NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, status integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,user_id,key))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS channel_events (provider text NOT NULL, event_id text NOT NULL, response text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,event_id))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS channel_deliveries (tenant_id text NOT NULL, provider_id text NOT NULL, status text NOT NULL, occurred_at timestamptz NOT NULL, PRIMARY KEY(tenant_id,provider_id))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS ai_daily_usage (scope text NOT NULL, day text NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY(scope,day))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS messaging_daily_usage (scope text NOT NULL, day text NOT NULL, count integer NOT NULL DEFAULT 0, PRIMARY KEY(scope,day))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS lesson_editions (tenant_id text NOT NULL REFERENCES organizations(id), lesson_id text NOT NULL, data jsonb NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,lesson_id))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS lesson_history (tenant_id text NOT NULL REFERENCES organizations(id), lesson_id text NOT NULL, version integer NOT NULL, data jsonb NOT NULL, actor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,lesson_id,version))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS lot_allocations (tenant_id text NOT NULL REFERENCES organizations(id), lot_id text NOT NULL REFERENCES entities(id), collection_id text NOT NULL REFERENCES entities(id), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,lot_id))`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS lot_collection_idx ON lot_allocations(tenant_id,collection_id)`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS whatsapp_threads (tenant_id text NOT NULL REFERENCES organizations(id),from_number text NOT NULL,last_request_at timestamptz,last_stop_at timestamptz,PRIMARY KEY(tenant_id,from_number))`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS whatsapp_inbox (id text PRIMARY KEY,tenant_id text NOT NULL REFERENCES organizations(id),provider_event_id text NOT NULL,from_number text NOT NULL,contact_id text,body text,content_type text NOT NULL,command text NOT NULL,occurred_at timestamptz NOT NULL,received_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,sample boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,provider_event_id))`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_inbox_page_idx ON whatsapp_inbox(tenant_id,received_at DESC,id DESC)`,
    );
    await tx.query(
      `ALTER TABLE whatsapp_inbox ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_inbox_phone_idx ON whatsapp_inbox(tenant_id,from_number,id)`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_inbox_expiry_idx ON whatsapp_inbox(tenant_id,expires_at) WHERE body IS NOT NULL`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS whatsapp_replies (id text PRIMARY KEY,tenant_id text NOT NULL REFERENCES organizations(id),inbox_id text NOT NULL REFERENCES whatsapp_inbox(id),actor_id text NOT NULL REFERENCES users(id),idempotency_key text NOT NULL,request_hash text NOT NULL,body text,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'queued',provider_id text,error text,delivery_uncertain boolean NOT NULL DEFAULT true,sample boolean NOT NULL DEFAULT false,UNIQUE(tenant_id,actor_id,idempotency_key))`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_replies_inbox_idx ON whatsapp_replies(tenant_id,inbox_id,created_at DESC,id DESC)`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_replies_provider_idx ON whatsapp_replies(tenant_id,provider_id) WHERE provider_id IS NOT NULL`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_replies_expiry_idx ON whatsapp_replies(tenant_id,expires_at) WHERE body IS NOT NULL`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS whatsapp_replies_pending_idx ON whatsapp_replies(tenant_id,inbox_id) WHERE delivery_uncertain=true OR status='queued'`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS market_data_sources (id text PRIMARY KEY,generation_id text,source_hash text,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,last_success_at timestamptz,last_attempt_at timestamptz,next_refresh_at timestamptz,lease_until timestamptz,lease_token text,failure_count integer NOT NULL DEFAULT 0,last_error text)`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS market_observations (source_id text NOT NULL REFERENCES market_data_sources(id),series_id text NOT NULL,observed_at text NOT NULL,commodity text NOT NULL,market text NOT NULL,price_type text NOT NULL,unit text NOT NULL,currency text NOT NULL,data jsonb NOT NULL,raw_fields jsonb NOT NULL,row_hash text NOT NULL,PRIMARY KEY(source_id,series_id))`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS market_observation_filter_idx ON market_observations(source_id,commodity,market,price_type)`,
    );
    await tx.query(
      `CREATE INDEX IF NOT EXISTS market_observation_date_idx ON market_observations(source_id,observed_at DESC,commodity,market,series_id)`,
    );
    await tx.query(
      `CREATE TABLE IF NOT EXISTS market_data_imports (id text PRIMARY KEY,source_id text NOT NULL REFERENCES market_data_sources(id),source_hash text,status text NOT NULL,record_count integer NOT NULL DEFAULT 0,series_count integer NOT NULL DEFAULT 0,error text,started_at timestamptz NOT NULL,finished_at timestamptz NOT NULL)`,
    );
  });
}
