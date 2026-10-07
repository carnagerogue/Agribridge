import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { migrate, openDatabase, type Database } from "../db.js";
import { DatabaseRateLimitStore } from "../rate-limit.js";

async function listen(db: Database) {
  const server: Server = createApp(db, loadConfig({}), {}).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
const badLogin = (url: string) =>
  fetch(`${url}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "nobody@example.org", password: "wrong" }),
  });

test("sign-in limits hold across application instances sharing a database", async () => {
  const db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  const first = await listen(db);
  const second = await listen(db);
  try {
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await badLogin(attempt % 2 ? second.url : first.url);
      assert.equal(response.status, 401, `attempt ${attempt + 1}`);
    }
    for (const instance of [first, second]) {
      const limited = await badLogin(instance.url);
      assert.equal(limited.status, 429);
      assert.equal(((await limited.json()) as any).error.code, "RATE_LIMITED");
    }
    const { rows } = await db.query<{ key: string }>(
      `SELECT key FROM rate_limits`,
    );
    assert.ok(rows.length >= 1);
    for (const row of rows) {
      assert.match(row.key, /^[0-9a-f]{64}$/);
      assert.equal(row.key.includes("127.0.0.1"), false);
    }
  } finally {
    await first.close();
    await second.close();
    await db.close();
  }
});

test("counters expire with their window and can be reset", async () => {
  const db = await openDatabase({ databasePath: ":memory:" });
  try {
    await migrate(db);
    const store = new DatabaseRateLimitStore(db, "test");
    store.init({ windowMs: 60_000 } as any);
    const other = new DatabaseRateLimitStore(db, "other");
    other.init({ windowMs: 60_000 } as any);
    assert.equal((await store.increment("client")).totalHits, 1);
    const second = await store.increment("client");
    assert.equal(second.totalHits, 2);
    assert.ok(second.resetTime!.getTime() > Date.now() + 50_000);
    assert.equal((await other.increment("client")).totalHits, 1);
    await store.decrement("client");
    assert.equal((await store.get("client"))?.totalHits, 1);
    await db.query(`UPDATE rate_limits SET reset_at=now()-interval '1 second'`);
    assert.equal(await store.get("client"), undefined);
    assert.equal((await store.increment("client")).totalHits, 1);
    await store.resetKey("client");
    assert.equal(await store.get("client"), undefined);
  } finally {
    await db.close();
  }
});
