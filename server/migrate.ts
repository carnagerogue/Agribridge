import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { migrate, openDatabase } from "./db.js";

/**
 * Applies pending schema migrations, then exits. Run it with credentials that
 * may change the schema before starting a release with DATABASE_MIGRATIONS=verify,
 * so the application role itself needs no DDL privileges.
 */
if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const db = await openDatabase(config);
try {
  const applied = await migrate(db, console.log);
  console.log(
    applied.length
      ? `Database schema is current (${applied.length} migration${applied.length === 1 ? "" : "s"} applied).`
      : "Database schema is already current.",
  );
} finally {
  await db.close();
}
