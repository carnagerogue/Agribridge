import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config.js";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://database.example/agribridge",
};

test("Render production uses its assigned HTTPS origin without a separate public-origin setting", () => {
  const config = loadConfig({
    ...production,
    RENDER_EXTERNAL_URL: "https://agribridge.onrender.com",
    PORT: "10000",
    HOST: "0.0.0.0",
  });
  assert.equal(config.publicOrigin, "https://agribridge.onrender.com");
  assert.equal(config.port, 10000);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.databaseTls, true);
  assert.equal(config.cookieName, "__Host-agribridge");
});

test("an explicit public origin takes precedence over Render's assigned URL", () => {
  assert.equal(
    loadConfig({
      ...production,
      PUBLIC_ORIGIN: "https://agribridge.example.ug",
      RENDER_EXTERNAL_URL: "https://agribridge.onrender.com",
    }).publicOrigin,
    "https://agribridge.example.ug",
  );
  assert.throws(
    () =>
      loadConfig({
        ...production,
        PUBLIC_ORIGIN: "http://agribridge.example.ug",
        RENDER_EXTERNAL_URL: "https://agribridge.onrender.com",
      }),
    /HTTPS/,
  );
});

test("Render's origin must satisfy the same HTTPS and exact-origin checks", () => {
  for (const url of ["http://agribridge.onrender.com", "not-a-url"])
    assert.throws(
      () => loadConfig({ ...production, RENDER_EXTERNAL_URL: url }),
      /HTTPS/,
    );
  for (const url of [
    "https://agribridge.onrender.com/",
    "https://agribridge.onrender.com/workspace",
    "https://agribridge.onrender.com?preview=true",
  ])
    assert.throws(
      () => loadConfig({ ...production, RENDER_EXTERNAL_URL: url }),
      /exact origin/,
    );
});

test("development keeps the documented local origin when a Render URL is inherited", () => {
  assert.equal(
    loadConfig({ RENDER_EXTERNAL_URL: "https://agribridge.onrender.com" })
      .publicOrigin,
    "http://localhost:5180",
  );
});

test("Render origin discovery does not bypass production database or demo guards", () => {
  const RENDER_EXTERNAL_URL = "https://agribridge.onrender.com";
  assert.throws(
    () => loadConfig({ ...production, RENDER_EXTERNAL_URL, AGRIBRIDGE_DEMO: "true" }),
    /Demo mode/,
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", RENDER_EXTERNAL_URL }),
    /PostgreSQL/,
  );
  assert.throws(
    () =>
      loadConfig({
        ...production,
        RENDER_EXTERNAL_URL,
        DATABASE_URL: "postgresql://database.example/agribridge?sslmode=disable",
      }),
    /TLS/,
  );
});
