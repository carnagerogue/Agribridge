import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { assertSchemaCurrent, openDatabase } from "./db.js";
import { resetMfa } from "./mfa-routes.js";

/**
 * Removes two-factor sign-in from one account and signs it out everywhere,
 * for an administrator who lost both their authenticator and recovery codes
 * when no other administrator can reset it. Run with server credentials:
 *   RESET_MFA_ACCOUNT=admin@example.org npm run admin:reset-mfa
 * The person sets up two-factor sign-in again at their next sign-in.
 */
if (existsSync(".env")) process.loadEnvFile(".env");
const account = process.env.RESET_MFA_ACCOUNT?.trim().toLowerCase();
if (!account)
  throw new Error("Set RESET_MFA_ACCOUNT to the account's email or phone.");
const db = await openDatabase(loadConfig());
try {
  await assertSchemaCurrent(db);
  const reset = await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; tenant_id: string }>(
      `SELECT id,tenant_id FROM users WHERE lower(email)=$1 OR phone=$1 FOR UPDATE`,
      [account],
    );
    if (rows.length !== 1) return false;
    await resetMfa(tx, rows[0].id);
    await tx.query(
      `INSERT INTO audit_events(id,tenant_id,actor_id,actor_name,action,entity_type,entity_id) VALUES($1,$2,'server-console','Server console','user.mfa_reset','users',$3)`,
      [randomUUID(), rows[0].tenant_id, rows[0].id],
    );
    return true;
  });
  console.log(
    reset
      ? "Two-factor sign-in was removed and every session for that account was signed out."
      : "No single account matches RESET_MFA_ACCOUNT; nothing was changed.",
  );
  if (!reset) process.exitCode = 1;
} finally {
  await db.close();
}
