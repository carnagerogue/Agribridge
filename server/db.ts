import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config.js";
import { MIGRATIONS } from "./migrations/index.js";
import { migrationStatus, runMigrations } from "./migrations/runner.js";

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

export async function migrate(
  db: Database,
  log: (message: string) => void = () => {},
) {
  return runMigrations(db, MIGRATIONS, log);
}

/** Throws unless every migration in this release has been applied. */
export async function assertSchemaCurrent(db: Database) {
  const status = await migrationStatus(db, MIGRATIONS);
  if (status.pending.length)
    throw new Error(
      `Database schema is at version ${status.current}; this release needs ${status.latest}. Run the migration command before starting the application.`,
    );
}
