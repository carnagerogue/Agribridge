import { createHash } from "node:crypto";
import type { Database, Queryable } from "../db.js";

/**
 * An ordered, immutable schema change. Statements run in one transaction, so a
 * failure leaves the database exactly as it was. Keep migrations as literal SQL:
 * the checksum must not depend on how TypeScript was compiled.
 */
export type Migration = {
  version: number;
  name: string;
  statements: readonly string[];
};

export type MigrationStatus = {
  current: number;
  latest: number;
  pending: Migration[];
};

// Stable application-wide key: replicas starting together apply migrations once.
const LOCK_KEY = 7_212_031_457;
const LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;

export function migrationChecksum(migration: Migration) {
  return createHash("sha256")
    .update(
      JSON.stringify([migration.version, migration.name, migration.statements]),
    )
    .digest("hex");
}

function assertOrdered(migrations: readonly Migration[]) {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1)
      throw new Error(
        `Migration versions must be contiguous from 1; found ${migration.version} at position ${index + 1}.`,
      );
    if (!/^[a-z0-9_]+$/.test(migration.name) || !migration.statements.length)
      throw new Error(`Migration ${migration.version} is malformed.`);
  });
}

async function lockedLedger(
  tx: Queryable,
  migrations: readonly Migration[],
  create: boolean,
): Promise<Set<number>> {
  await tx.query(`SELECT pg_advisory_xact_lock($1)`, [LOCK_KEY]);
  // A verification-only check must work for a role without DDL privileges.
  if (create) await tx.query(LEDGER);
  else {
    const { rows } = await tx.query<{ present: boolean }>(
      `SELECT to_regclass('schema_migrations') IS NOT NULL AS present`,
    );
    if (!rows[0].present) return new Set();
  }
  const { rows } = await tx.query<{
    version: number;
    name: string;
    checksum: string;
  }>(`SELECT version,name,checksum FROM schema_migrations ORDER BY version`);
  const latest = migrations.length;
  for (const row of rows) {
    if (row.version > latest)
      throw new Error(
        `Database schema version ${row.version} (${row.name}) is newer than this release supports (${latest}). Deploy a release that includes it; do not run older code against a newer schema.`,
      );
    const known = migrations[row.version - 1];
    if (known.name !== row.name || migrationChecksum(known) !== row.checksum)
      throw new Error(
        `Applied migration ${row.version} (${row.name}) does not match this release. Applied migrations must never be edited; add a new migration instead.`,
      );
  }
  return new Set(rows.map((row) => row.version));
}

export async function migrationStatus(
  db: Database,
  migrations: readonly Migration[],
  create = false,
): Promise<MigrationStatus> {
  assertOrdered(migrations);
  const applied = await db.transaction((tx) =>
    lockedLedger(tx, migrations, create),
  );
  const pending = migrations.filter((item) => !applied.has(item.version));
  return {
    current: applied.size ? Math.max(...applied) : 0,
    latest: migrations.length,
    pending,
  };
}

/** Applies pending migrations in order and returns the versions it applied. */
export async function runMigrations(
  db: Database,
  migrations: readonly Migration[],
  log: (message: string) => void = () => {},
): Promise<number[]> {
  const { pending } = await migrationStatus(db, migrations, true);
  const applied: number[] = [];
  for (const migration of pending)
    await db.transaction(async (tx) => {
      // Another process may have applied it after the status check.
      if ((await lockedLedger(tx, migrations, true)).has(migration.version))
        return;
      for (const statement of migration.statements) await tx.query(statement);
      await tx.query(
        `INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)`,
        [migration.version, migration.name, migrationChecksum(migration)],
      );
      applied.push(migration.version);
      log(
        `Applied database migration ${migration.version} (${migration.name}).`,
      );
    });
  return applied;
}
