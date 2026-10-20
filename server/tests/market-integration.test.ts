import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { openDatabase, migrate, type Database } from "../db.js";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { seedDemo, DEMO_TENANT, DEMO_USERS } from "../seed.js";
import { issueMarketChannelLink } from "../market-notifications.js";

let db: Database, server: Server, base: string;
let farmer: { cookie: string; csrf: string },
  operator: { cookie: string; csrf: string };
const env = {
  AGRIBRIDGE_DEMO: "true",
  MARKET_WHATSAPP_ENABLED: "true",
  CHANNEL_ORGANIZATION_ID: DEMO_TENANT,
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_APP_SECRET: "local-test-webhook-signature-only",
};
async function login(role: "farmer" | "operator") {
  const response = await fetch(base + "/api/auth/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role }),
  });
  assert.equal(response.status, 200);
  const session = (await response.json()) as { csrfToken: string };
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    csrf: session.csrfToken,
  };
}
before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await seedDemo(db);
  server = createApp(db, loadConfig(env), env).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  farmer = await login("farmer");
  operator = await login("operator");
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  await db.close();
});
async function signed(body: string, phone: string, id = randomUUID()) {
  const raw = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: env.WHATSAPP_PHONE_NUMBER_ID },
              messages: [
                {
                  id,
                  from: phone.replace("+", ""),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const signature =
    "sha256=" +
    createHmac("sha256", env.WHATSAPP_APP_SECRET).update(raw).digest("hex");
  return fetch(base + "/api/channels/whatsapp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: raw,
  });
}

test("signed LINK callbacks verify the account without retaining the secret in the inbox or signup queue", async () => {
  const challenge = await issueMarketChannelLink(
    db,
    DEMO_TENANT,
    DEMO_USERS.farmer,
  );
  const phone = "+256700088881";
  const id = randomUUID();
  assert.equal((await signed(challenge.command, phone, id)).status, 200);
  assert.equal((await signed(challenge.command, phone, id)).status, 200);
  const status = await fetch(base + "/api/marketplace/channel-link", {
    headers: { cookie: farmer.cookie },
  });
  const state = (await status.json()) as {
    linked: boolean;
    paymentUpdatesEnabled: boolean;
    maskedPhone: string;
  };
  assert.equal(state.linked, true);
  assert.equal(state.paymentUpdatesEnabled, false);
  assert.notEqual(state.maskedPhone, phone);
  const { rows } = await db.query(
    "SELECT id FROM whatsapp_inbox WHERE tenant_id=$1 AND from_number=$2 UNION ALL SELECT id FROM market_conversation_jobs WHERE tenant_id=$1 AND phone=$2",
    [DEMO_TENANT, phone],
  );
  assert.equal(rows.length, 0);
});

test("automated signup callbacks deduplicate without generating a staff task for every profile field", async () => {
  const {
    rows: [beforeCount],
  } = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM tasks WHERE tenant_id=$1",
    [DEMO_TENANT],
  );
  const phone = "+256700088882",
    id = randomUUID();
  assert.equal((await signed("REGISTER", phone, id)).status, 200);
  assert.equal((await signed("REGISTER", phone, id)).status, 200);
  const { rows: jobs } = await db.query(
    "SELECT id FROM market_conversation_jobs WHERE tenant_id=$1 AND phone=$2",
    [DEMO_TENANT, phone],
  );
  assert.equal(jobs.length, 1);
  const {
    rows: [afterCount],
  } = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM tasks WHERE tenant_id=$1",
    [DEMO_TENANT],
  );
  assert.equal(afterCount.count, beforeCount.count);
  assert.equal((await signed("HUMAN", phone)).status, 200);
  const {
    rows: [handoffCount],
  } = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM tasks WHERE tenant_id=$1",
    [DEMO_TENANT],
  );
  assert.equal(Number(handoffCount.count), Number(beforeCount.count) + 1);
});

test("channel signup and produce intake are private to authorized organization staff", async () => {
  const path = "/api/marketplace/channel-registrations";
  assert.equal((await fetch(base + path)).status, 401);
  assert.equal(
    (await fetch(base + path, { headers: { cookie: farmer.cookie } })).status,
    403,
  );
  const response = await fetch(base + path, {
    headers: { cookie: operator.cookie },
  });
  assert.equal(response.status, 200);
  const data = (await response.json()) as {
    registrations: { items: unknown[] };
    supply: { items: unknown[] };
  };
  assert.ok(Array.isArray(data.registrations.items));
  assert.ok(Array.isArray(data.supply.items));
});
