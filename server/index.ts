import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import { loadConfig } from "./config.js";
import { openDatabase, migrate } from "./db.js";
import { seedDemo } from "./seed.js";
import { createApp } from "./app.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const db = await openDatabase(config);
await migrate(db);
if (config.demo) await seedDemo(db);
const app = createApp(db, config);
const dist = path.resolve("dist");
if (existsSync(path.join(dist, "index.html"))) {
  app.use(
    express.static(dist, {
      index: false,
      maxAge: config.production ? "1h" : 0,
    }),
  );
  app.get("/{*path}", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(dist, "index.html"));
  });
}
const server = app.listen(config.port, config.host, () =>
  console.log(
    `Agribridge API listening on http://${config.host}:${config.port} (${config.demo ? "explicit local demo" : config.production ? "production" : "development"})`,
  ),
);
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  server.close(() => {
    db.close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
