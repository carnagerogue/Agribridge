import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { openDatabase, migrate, assertSchemaCurrent } from "./db.js";
import { seedDemo } from "./seed.js";
import { createApp } from "./app.js";
import { mountWebApp } from "./web.js";
import { createLogger, errorFields } from "./observability.js";
import { createMarketDesk } from "./market-intelligence.js";
import {
  drainMarketConversationJobs,
  retrieveMarketConversationInformation,
} from "./market-conversation-worker.js";
import { drainMarketPaymentNotifications } from "./market-notifications.js";

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
let marketPulse: Promise<void> | undefined;
const marketDesk = createMarketDesk(db);
const marketWorkerTimer =
  process.env.MARKET_WHATSAPP_ENABLED === "true" ||
  process.env.MARKET_PAYMENT_NOTIFICATIONS_ENABLED === "true"
    ? setInterval(() => {
        if (closing || marketPulse) return;
        marketPulse = (async () => {
          await drainMarketConversationJobs(db, process.env, {
            limit: 10,
            retrieve: async (question, context) => {
              if (question.kind === "produce")
                return retrieveMarketConversationInformation(
                  db,
                  question,
                  context,
                );
              const answer = await marketDesk.answer(
                {
                  question: `${question.kind} ${question.query}`.slice(0, 600),
                  crop: question.crop,
                  district: question.district,
                },
                { organizationId: context.tenantId },
              );
              return answer.answer;
            },
          });
          await drainMarketPaymentNotifications(db, process.env, { limit: 10 });
        })()
          .catch((error) =>
            logger.error("market.worker_failed", errorFields(error)),
          )
          .finally(() => {
            marketPulse = undefined;
          });
      }, 5000).unref()
    : undefined;
const shutdown = () => {
  if (closing) return;
  closing = true;
  if (marketWorkerTimer) clearInterval(marketWorkerTimer);
  logger.info("server.stopping");
  server.close(() => {
    Promise.resolve(marketPulse)
      .then(() => db.close())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
