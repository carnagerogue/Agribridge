import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { openDatabase, migrate, assertSchemaCurrent } from "./db.js";
import { seedDemo } from "./seed.js";
import { createApp } from "./app.js";
import { mountWebApp } from "./web.js";
import { createLogger, errorFields } from "./observability.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const logger = createLogger();
process.on("unhandledRejection", (error) =>
  logger.error("process.unhandled_rejection", errorFields(error)),
);
process.on("uncaughtException", (error) => {
  logger.error("process.uncaught_exception", errorFields(error));
  process.exit(1);
});
const config = loadConfig();
const db = await openDatabase(config);
if (config.databaseMigrations === "auto")
  await migrate(db, (message) =>
    logger.info("database.migration", { message }),
  );
else await assertSchemaCurrent(db);
if (config.demo) await seedDemo(db);
const app = createApp(db, config, process.env, { logger });
mountWebApp(app, config.production);
const mode = config.demo
  ? "demo"
  : config.production
    ? "production"
    : "development";
const server = app.listen(config.port, config.host, () =>
  logger.info("server.started", {
    url: `http://${config.host}:${config.port}`,
    mode,
  }),
);
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  logger.info("server.stopping");
  server.close(() => {
    db.close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
