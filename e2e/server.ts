import { rmSync } from "node:fs";
import path from "node:path";
import { installExternalStubs } from "./external.ts";
import { E2E_MFA_KEY, SECURE_ADMIN } from "./accounts.ts";
import { createApp } from "../server/app.ts";
import { loadConfig } from "../server/config.ts";
import { migrate, openDatabase } from "../server/db.ts";
import { seedDemo } from "../server/seed.ts";
import { hashPassword } from "../server/security.ts";
import { mountWebApp } from "../server/web.ts";

/**
 * Serves the production web build and the API on a fresh local database.
 * E2E_MODE=demo (default) runs the labelled demo; E2E_MODE=secure runs without
 * demo mode, with one administrator account and two-factor sign-in enforced.
 * Started by Playwright; see playwright.config.ts.
 */
const secure = process.env.E2E_MODE === "secure";
const port = Number(process.env.E2E_PORT || (secure ? 5198 : 5199));
const databasePath = path.resolve(`.data/e2e-${secure ? "secure" : "demo"}`);
rmSync(databasePath, { recursive: true, force: true });
installExternalStubs();
const env = {
  AGRIBRIDGE_DEMO: secure ? "false" : "true",
  HOST: "127.0.0.1",
  PORT: String(port),
  PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
  DATABASE_PATH: databasePath,
  MFA_ENCRYPTION_KEY: E2E_MFA_KEY,
};
const config = loadConfig(env);
const db = await openDatabase(config);
await migrate(db);
if (secure) {
  await db.query(
    `INSERT INTO organizations(id,name) VALUES('org-e2e','End-to-end cooperative')`,
  );
  await db.query(
    `INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES('user-e2e-admin','org-e2e',$1,$2,$3,'admin')`,
    [
      SECURE_ADMIN.name,
      SECURE_ADMIN.email,
      await hashPassword(SECURE_ADMIN.password),
    ],
  );
} else await seedDemo(db);
const app = createApp(db, config, env);
if (!mountWebApp(app, false))
  throw new Error("Build the web app before end-to-end tests: npm run build");
app.listen(config.port, config.host, () =>
  console.log(`End-to-end server ready at ${config.publicOrigin}`),
);
