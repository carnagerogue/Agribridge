import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config.js";
import { originGuard } from "../security.js";
import type { Request, Response } from "express";

test("the default demo origin accepts the documented web port", () => {
  const config = loadConfig({ AGRIBRIDGE_DEMO: "true" });
  const req = {
    method: "POST",
    get: (name: string) =>
      name === "origin" ? "http://localhost:5180" : undefined,
  } as Request;
  originGuard(config)(req, {} as Response, (error) =>
    assert.equal(error, undefined),
  );
});

test("Render's assigned HTTPS URL configures production without disabling TLS", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://database.example/agribridge",
    RENDER_EXTERNAL_URL: "https://agribridge-example.onrender.com",
  });
  assert.equal(config.publicOrigin, "https://agribridge-example.onrender.com");
  assert.equal(config.databaseTls, true);
  assert.equal(config.demo, false);
});

test("an explicit custom origin takes precedence over the Render URL", () => {
  assert.equal(
    loadConfig({
      PUBLIC_ORIGIN: "https://farm.example",
      RENDER_EXTERNAL_URL: "https://agribridge-example.onrender.com",
    }).publicOrigin,
    "https://farm.example",
  );
});

test("Render origins still require exact HTTPS origins in production", () => {
  for (const origin of [
    "http://app.example",
    "https://app.example/path",
    "https://app.example/",
  ]) {
    assert.throws(() =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://database.example/agribridge",
        RENDER_EXTERNAL_URL: origin,
      }),
    );
  }
});
