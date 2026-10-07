import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { migrate, openDatabase, type Database } from "../db.js";
import { createLogger, logPath } from "../observability.js";

type Entry = Record<string, any>;
async function withServer(
  db: Database,
  env: NodeJS.ProcessEnv,
  work: (url: string, entries: Entry[]) => Promise<void>,
) {
  const entries: Entry[] = [];
  const logger = createLogger((line) => entries.push(JSON.parse(line)));
  const server: Server = createApp(db, loadConfig({}), env, { logger }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as { port: number };
  try {
    await work(`http://127.0.0.1:${port}`, entries);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
// The log entry is written when the response finishes, just after the client sees it.
const settle = () => new Promise((resolve) => setImmediate(resolve));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("log paths drop query strings and mask identifiers", () => {
  assert.equal(
    logPath("/api/weather?latitude=0.3136&longitude=32.5811"),
    "/api/weather",
  );
  assert.equal(
    logPath("/api/farms/3f2c1d4e-1a2b-4c3d-9e8f-0123456789ab"),
    "/api/farms/:id",
  );
  assert.equal(
    logPath("/api/progress/lesson-maize"),
    "/api/progress/lesson-maize",
  );
  assert.equal(logPath(`/api/${"x".repeat(500)}`).length, 200);
});

test("each API request gets an ID and one privacy-safe log line", async () => {
  const db = await openDatabase({ databasePath: ":memory:" });
  try {
    await migrate(db);
    await withServer(db, {}, async (url, entries) => {
      const health = await fetch(`${url}/api/health`);
      const id = health.headers.get("x-request-id")!;
      assert.match(id, UUID);
      const missing = await fetch(
        `${url}/api/unknown/3f2c1d4e-1a2b-4c3d-9e8f-0123456789ab?latitude=0.3136`,
      );
      assert.equal(missing.status, 401);
      await settle();
      const [first, second] = entries.filter(
        (entry) => entry.event === "http.request",
      );
      assert.equal(first.requestId, id);
      assert.equal(first.level, "info");
      assert.equal(first.method, "GET");
      assert.equal(first.path, "/api/health");
      assert.equal(first.status, 200);
      assert.equal(typeof first.durationMs, "number");
      assert.match(first.time, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(second.level, "warn");
      assert.equal(second.path, "/api/unknown/:id");
      assert.equal(JSON.stringify(entries).includes("0.3136"), false);
    });
  } finally {
    await db.close();
  }
});

test("an inbound request ID is reused only behind a trusted proxy", async () => {
  const db = await openDatabase({ databasePath: ":memory:" });
  try {
    await migrate(db);
    const inbound = { "x-request-id": "edge-proxy-1234" };
    await withServer(db, {}, async (url) => {
      const response = await fetch(`${url}/api/health`, { headers: inbound });
      assert.match(response.headers.get("x-request-id")!, UUID);
    });
    await withServer(db, { TRUST_PROXY: "1" }, async (url) => {
      const trusted = await fetch(`${url}/api/health`, { headers: inbound });
      assert.equal(trusted.headers.get("x-request-id"), "edge-proxy-1234");
      const forged = await fetch(`${url}/api/health`, {
        headers: { "x-request-id": "bad id; injected" },
      });
      assert.match(forged.headers.get("x-request-id")!, UUID);
    });
  } finally {
    await db.close();
  }
});

test("readiness reports whether the database answers", async () => {
  const db = await openDatabase({ databasePath: ":memory:" });
  try {
    await migrate(db);
    await withServer(db, {}, async (url) => {
      const ready = await fetch(`${url}/api/health/ready`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: "ready" });
    });
  } finally {
    await db.close();
  }
  const broken: Database = {
    query: async () => {
      throw new Error("connection refused for user secret-db-user");
    },
    transaction: async () => {
      throw new Error("unavailable");
    },
    close: async () => {},
  };
  await withServer(broken, {}, async (url, entries) => {
    const unavailable = await fetch(`${url}/api/health/ready`);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), {
      status: "unavailable",
      checks: { database: "unavailable" },
    });
    await settle();
    assert.ok(
      entries.some((entry) => entry.event === "health.database_unavailable"),
    );
    assert.equal(JSON.stringify(entries).includes("secret-db-user"), false);
  });
});

test("unexpected failures return a request ID and log no error message", async () => {
  const broken: Database = {
    query: async () => {
      throw Object.assign(
        new Error("duplicate key value (phone)=(+256700000001)"),
        { code: "23505" },
      );
    },
    transaction: async () => {
      throw new Error("unavailable");
    },
    close: async () => {},
  };
  await withServer(broken, {}, async (url, entries) => {
    const response = await fetch(`${url}/api/auth/session`, {
      headers: { cookie: `agribridge_session=${"ab".repeat(32)}` },
    });
    assert.equal(response.status, 500);
    const body = (await response.json()) as any;
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
    await settle();
    const failure = entries.find(
      (entry) => entry.event === "http.unhandled_error",
    )!;
    assert.equal(failure.level, "error");
    assert.equal(failure.requestId, body.error.requestId);
    assert.equal(failure.errorName, "Error");
    assert.equal(failure.errorCode, "23505");
    assert.match(failure.stack, /^at /);
    const logged = JSON.stringify(entries);
    assert.equal(logged.includes("+256700000001"), false);
    assert.equal(logged.includes("duplicate key"), false);
    assert.equal(logged.includes("ab".repeat(32)), false);
  });
});
