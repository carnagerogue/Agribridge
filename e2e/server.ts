import { rmSync } from "node:fs";
import path from "node:path";
import { installExternalStubs } from "./external.ts";
import { createApp } from "../server/app.ts";
import { loadConfig } from "../server/config.ts";
import { migrate, openDatabase } from "../server/db.ts";
import { seedDemo } from "../server/seed.ts";
import { mountWebApp } from "../server/web.ts";

/**
 * Serves the production web build and the API in demo mode on a fresh local
 * database. Started by Playwright; see playwright.config.ts.
 */
export const E2E_PORT = Number(process.env.E2E_PORT || 5199);
const databasePath = path.resolve(".data/e2e");
rmSync(databasePath, { recursive: true, force: true });
installExternalStubs();
const env = {
  AGRIBRIDGE_DEMO: "true",
  HOST: "127.0.0.1",
  PORT: String(E2E_PORT),
  PUBLIC_ORIGIN: `http://127.0.0.1:${E2E_PORT}`,
  DATABASE_PATH: databasePath,
};
const config = loadConfig(env);
const db = await openDatabase(config);
await migrate(db);
await seedDemo(db);
const app = createApp(db, config, env);
if (!mountWebApp(app, false))
  throw new Error("Build the web app before end-to-end tests: npm run build");
app.listen(config.port, config.host, () =>
  console.log(`End-to-end server ready at ${config.publicOrigin}`),
);
