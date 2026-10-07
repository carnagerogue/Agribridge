import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { openDatabase, migrate, type Database } from "../db.js";
import { loadConfig } from "../config.js";
import { seedDemo, DEMO_TENANT, DEMO_USERS } from "../seed.js";
import { hashPassword } from "../security.js";
import { createChannelBridge } from "../channel-bridge.js";

const env = {
  CHANNEL_ORGANIZATION_ID: DEMO_TENANT,
  WHATSAPP_BUSINESS_NUMBER: "+256700099990",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890123",
  WHATSAPP_API_VERSION: "v23.0",
  WHATSAPP_ACCESS_TOKEN: "test-only-token-never-a-real-secret",
  WHATSAPP_APP_SECRET: "test-only-signing-secret",
  WHATSAPP_VERIFY_TOKEN: "test-only-verification-token",
  MESSAGING_RECIPIENT_DAILY_LIMIT: "20",
};
type Client = { cookie: string; csrf: string };
let db: Database,
  server: Server,
  demoServer: Server,
  url: string,
  demoUrl: string;
let operator: Client, farmer: Client, other: Client;
let providerCalls = 0;
let lastOutbound: any;
let behavior: "success" | "uncertain" | "early" | "held" = "success";
let releaseProvider: (() => void) | undefined;
const fetchMock: typeof fetch = async (_url, options) => {
  providerCalls++;
  lastOutbound = JSON.parse(String(options?.body));
  if (behavior === "uncertain") throw new Error("Network outcome unknown");
  if (behavior === "held")
    await new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
  const providerId = `test-provider-${providerCalls}`;
  if (behavior === "early")
    await createChannelBridge(db, env).handleDelivery({
      eventId: `early-${providerId}`,
      channel: "whatsapp",
      provider: "meta",
      providerId,
      status: "delivered",
      occurredAt: new Date().toISOString(),
    });
  return new Response(JSON.stringify({ messages: [{ id: providerId }] }), {
    status: 200,
  });
};
async function call(
  path: string,
  client?: Client,
  method = "GET",
  body?: unknown,
  key?: string,
  base = url,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(client ? { cookie: client.cookie, "x-csrf-token": client.csrf } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as any,
    response,
  };
}
async function login(email: string) {
  const result = await call("/api/auth/login", undefined, "POST", {
    email,
    password: "Only-for-server-tests-123",
  });
  assert.equal(result.status, 200);
  return {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrfToken,
  };
}
async function inbound(
  phone: string,
  body: string,
  options: {
    id?: string;
    at?: number;
    type?: string;
    badSignature?: boolean;
  } = {},
) {
  const id = options.id || randomUUID();
  const type = options.type || "text";
  const payload = {
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
                  from: phone.slice(1),
                  timestamp: String(
                    Math.floor((options.at ?? Date.now() - 10_000) / 1000),
                  ),
                  type,
                  ...(type === "text"
                    ? { text: { body } }
                    : { image: { id: "never-download-this" } }),
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  const signature = createHmac("sha256", env.WHATSAPP_APP_SECRET)
    .update(raw)
    .digest("hex");
  const response = await fetch(`${url}/api/channels/whatsapp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": `sha256=${options.badSignature ? "0".repeat(64) : signature}`,
    },
    body: raw,
  });
  return { status: response.status, eventId: `meta:message:${id}` };
}
async function saved(eventId: string) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM whatsapp_inbox WHERE tenant_id=$1 AND provider_event_id=$2`,
    [DEMO_TENANT, eventId],
  );
  return rows[0]?.id;
}
async function item(id: string) {
  return (await call("/api/whatsapp/inbox?limit=50", operator)).body.items.find(
    (entry: any) => entry.id === id,
  );
}
before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await seedDemo(db);
  const hash = await hashPassword("Only-for-server-tests-123");
  await db.query(
    `UPDATE users SET email=id||'@example.test',password_hash=$1`,
    [hash],
  );
  await db.query(
    `INSERT INTO organizations(id,name) VALUES('whatsapp-other','Other organization')`,
  );
  await db.query(
    `INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES('whatsapp-other-operator','whatsapp-other','Other operator','other-wa@example.test',$1,'operator')`,
    [hash],
  );
  server = createApp(db, loadConfig({}), env, {
    whatsappFetch: fetchMock,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as any).port}`;
  demoServer = createApp(db, loadConfig({ AGRIBRIDGE_DEMO: "true" }), env, {
    whatsappFetch: fetchMock,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => demoServer.once("listening", resolve));
  demoUrl = `http://127.0.0.1:${(demoServer.address() as any).port}`;
  operator = await login(`${DEMO_USERS.operator}@example.test`);
  farmer = await login(`${DEMO_USERS.farmer}@example.test`);
  other = await login("other-wa@example.test");
});
after(async () => {
  for (const running of [server, demoServer])
    await new Promise<void>((resolve, reject) =>
      running.close((error) => (error ? reject(error) : resolve())),
    );
  await db.close();
});

test("connection is authenticated, tenant-scoped, no-secret configuration; demo never exposes a link", async () => {
  assert.equal((await call("/api/whatsapp/connection")).status, 401);
  const status = await call("/api/whatsapp/connection", farmer);
  assert.equal(status.body.status, "configured");
  assert.equal(status.body.chatUrl, "https://wa.me/256700099990");
  assert.equal(status.response.headers.get("cache-control"), "no-store");
  assert.equal(
    JSON.stringify(status.body).includes(env.WHATSAPP_ACCESS_TOKEN),
    false,
  );
  assert.equal(
    JSON.stringify(status.body).includes(env.WHATSAPP_APP_SECRET),
    false,
  );
  const hidden = await call("/api/whatsapp/connection", other);
  assert.equal(hidden.body.status, "not_configured");
  assert.equal(hidden.body.businessNumber, null);
  assert.equal(hidden.body.chatUrl, null);
  const demo = await call(
    "/api/whatsapp/connection",
    operator,
    "GET",
    undefined,
    undefined,
    demoUrl,
  );
  assert.equal(demo.body.status, "demo");
  assert.equal(demo.body.chatUrl, null);
  assert.equal((await call("/api/whatsapp/inbox", farmer)).status, 403);
  assert.equal((await call("/api/whatsapp/inbox", other)).body.items.length, 0);
});

test("verified incoming text persists exactly once, stays private, and does not create contacts or consent", async () => {
  const phone = "+256700099901",
    body = "Private question: when is the cooperative collecting beans?";
  const rejected = await inbound(phone, body, { badSignature: true });
  assert.equal(rejected.status, 401);
  assert.equal(await saved(rejected.eventId), undefined);
  const id = randomUUID();
  const first = await inbound(phone, body, { id });
  assert.equal(first.status, 200);
  assert.equal((await inbound(phone, body, { id })).status, 200);
  const rowId = await saved(first.eventId);
  const row = await item(rowId);
  assert.equal(row.body, body);
  assert.equal(row.contact, null);
  assert.equal(row.canReply, true);
  const count = await db.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM whatsapp_inbox WHERE provider_event_id=$1`,
    [first.eventId],
  );
  assert.equal(count.rows[0].count, 1);
  const contacts = await db.query(`SELECT id FROM contacts WHERE phone=$1`, [
    phone,
  ]);
  assert.equal(contacts.rows.length, 0);
  const bootstrap = JSON.stringify(
    (await call("/api/bootstrap", operator)).body,
  );
  assert.equal(bootstrap.includes(body), false);
  assert.equal(bootstrap.includes(phone), false);
  const audit = JSON.stringify(
    (await db.query(`SELECT * FROM audit_events`)).rows,
  );
  assert.equal(audit.includes(body), false);
  assert.equal(audit.includes(phone), false);
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${rowId}/reply`,
        other,
        "POST",
        { body: "Not your tenant" },
        randomUUID(),
      )
    ).status,
    404,
  );
});

test("unknown contacts receive only trusted-window support replies; replay never resends after STOP", async () => {
  const phone = "+256700099902";
  const event = await inbound(phone, "Please explain storage options.");
  const id = await saved(event.eventId);
  const key = randomUUID();
  const count = providerCalls;
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${id}/reply`,
        farmer,
        "POST",
        { body: "Forbidden" },
        randomUUID(),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${id}/reply`,
        operator,
        "POST",
        { body: "Hello", to: "+256700000000" },
        randomUUID(),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(`/api/whatsapp/inbox/${id}/reply`, operator, "POST", {
        body: "Hello",
      })
    ).status,
    400,
  );
  const reply = await call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "An operator can explain the collection process." },
    key,
  );
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  assert.equal(reply.body.status, "sent");
  assert.equal(providerCalls, count + 1);
  assert.equal(lastOutbound.to, phone.slice(1));
  assert.equal(reply.body.deliveryUncertain, false);
  await inbound(phone, "STOP", { at: Date.now() - 2000 });
  const replay = await call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "An operator can explain the collection process." },
    key,
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.body.id, reply.body.id);
  assert.equal(providerCalls, count + 1);
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${id}/reply`,
        operator,
        "POST",
        { body: "Changed body" },
        key,
      )
    ).body.error.code,
    "IDEMPOTENCY_CONFLICT",
  );
});

test("STOP is monotonic; START is not support or marketing consent; newer direct request reopens support only", async () => {
  const phone = "+256700000001";
  const now = Date.now();
  const event = await inbound(phone, "Please help with my maize.", {
    at: now - 20_000,
  });
  const id = await saved(event.eventId);
  await inbound(phone, "STOP", { at: now - 10_000 });
  assert.equal((await item(id)).replyBlockedReason, "stopped");
  await inbound(phone, "START", { at: now - 5000 });
  assert.equal((await item(id)).replyBlockedReason, "stopped");
  await inbound(phone, "Delayed old question", { at: now - 15_000 });
  assert.equal((await item(id)).replyBlockedReason, "stopped");
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${id}/reply`,
        operator,
        "POST",
        { body: "Not allowed" },
        randomUUID(),
      )
    ).status,
    409,
  );
  await inbound(phone, "Please answer this new support question.", {
    at: now - 1000,
  });
  assert.equal((await item(id)).canReply, true);
  const contact = await db.query<any>(
    `SELECT consent,consent_channels FROM contacts WHERE id='contact-grace'`,
  );
  assert.equal(contact.rows[0].consent, false);
  assert.deepEqual(contact.rows[0].consent_channels, []);
});

test("expired windows and demo fixtures cannot send; long text is marked and media is never downloaded", async () => {
  const count = providerCalls;
  const expired = await inbound("+256700099903", "Old request", {
    at: Date.now() - 25 * 3_600_000,
  });
  const expiredId = await saved(expired.eventId);
  assert.equal((await item(expiredId)).replyBlockedReason, "window_expired");
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${expiredId}/reply`,
        operator,
        "POST",
        { body: "Too late" },
        randomUUID(),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/api/whatsapp/inbox/sample-whatsapp-question/reply",
        operator,
        "POST",
        { body: "Never transmit sample" },
        randomUUID(),
      )
    ).status,
    409,
  );
  const long = await inbound("+256700099904", "A".repeat(4096));
  assert.equal(long.status, 200);
  const row = await item(await saved(long.eventId));
  assert.equal(row.body.length, 1600);
  assert.equal(row.truncated, true);
  const media = await inbound("+256700099905", "", { type: "image" });
  const mediaRow = await item(await saved(media.eventId));
  assert.equal(mediaRow.contentType, "unsupported");
  assert.match(mediaRow.body, /not downloaded/);
  assert.equal(providerCalls, count);
});

test("concurrent same-key replay returns reservation; unresolved sends block other messages to that phone", async () => {
  behavior = "held";
  const phone = "+256700099906";
  const event = await inbound(phone, "Question one");
  const id = await saved(event.eventId);
  const key = randomUUID();
  const count = providerCalls;
  const sending = call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "Reply in flight" },
    key,
  );
  for (let i = 0; i < 100 && !releaseProvider; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(releaseProvider);
  const replay = await call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "Reply in flight" },
    key,
  );
  assert.equal(replay.status, 200);
  assert.equal(replay.body.status, "queued");
  assert.equal(replay.body.deliveryUncertain, true);
  const another = await inbound(phone, "Question two");
  const anotherId = await saved(another.eventId);
  assert.equal((await item(anotherId)).replyBlockedReason, "reply_unresolved");
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${anotherId}/reply`,
        operator,
        "POST",
        { body: "Duplicate attempt" },
        randomUUID(),
      )
    ).status,
    409,
  );
  assert.equal(providerCalls, count + 1);
  releaseProvider!();
  releaseProvider = undefined;
  const result = await sending;
  assert.equal(result.body.status, "sent");
  behavior = "success";
  assert.equal((await item(anotherId)).canReply, true);
});

test("uncertain provider outcomes are durable and never retried; early delivery receipts win", async () => {
  behavior = "uncertain";
  const event = await inbound("+256700099907", "Help with harvest");
  const id = await saved(event.eventId);
  const key = randomUUID();
  const count = providerCalls;
  const sent = await call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "Support answer" },
    key,
  );
  assert.equal(sent.body.deliveryUncertain, true);
  assert.equal(sent.body.status, "failed");
  const replay = await call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "Support answer" },
    key,
  );
  assert.equal(replay.body.id, sent.body.id);
  assert.equal(providerCalls, count + 1);
  assert.equal(
    (
      await call(
        `/api/whatsapp/inbox/${id}/reply`,
        operator,
        "POST",
        { body: "Support answer" },
        randomUUID(),
      )
    ).status,
    409,
  );
  behavior = "early";
  const early = await inbound("+256700099908", "A new question");
  const earlyId = await saved(early.eventId);
  const result = await call(
    `/api/whatsapp/inbox/${earlyId}/reply`,
    operator,
    "POST",
    { body: "A sourced answer" },
    randomUUID(),
  );
  assert.equal(result.body.status, "delivered");
  assert.equal(result.body.deliveryUncertain, false);
  await createChannelBridge(db, env).handleDelivery({
    eventId: "late-sent-wa",
    channel: "whatsapp",
    provider: "meta",
    providerId: `test-provider-${providerCalls}`,
    status: "sent",
    occurredAt: new Date().toISOString(),
  });
  assert.equal((await item(earlyId)).replies[0].status, "delivered");
  behavior = "success";
});

test("body expiry redacts inbox and replies without generic idempotency copies; cursor is stable and bounded", async () => {
  const event = await inbound("+256700099909", "Retained body test");
  const id = await saved(event.eventId);
  const key = randomUUID();
  const reply = await call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "Private retained reply" },
    key,
  );
  await db.query(
    `UPDATE whatsapp_inbox SET expires_at=now()-interval '1 second' WHERE id=$1`,
    [id],
  );
  await db.query(
    `UPDATE whatsapp_replies SET expires_at=now()-interval '1 second' WHERE id=$1`,
    [reply.body.id],
  );
  const row = await item(id);
  assert.equal(row.body, null);
  assert.equal(row.replies[0].body, null);
  assert.equal(row.replyBlockedReason, "expired");
  const replay = await call(
    `/api/whatsapp/inbox/${id}/reply`,
    operator,
    "POST",
    { body: "Private retained reply" },
    key,
  );
  assert.equal(replay.body.body, null);
  assert.equal(
    (
      await db.query<{ body: string | null }>(
        `SELECT body FROM whatsapp_replies WHERE id=$1`,
        [reply.body.id],
      )
    ).rows[0].body,
    null,
  );
  assert.equal(
    (await db.query(`SELECT key FROM idempotency WHERE key=$1`, [key])).rows
      .length,
    0,
  );
  const old = await inbound(
    "+256700099910",
    "Old replay must not revive body",
    { at: Date.now() - 31 * 86_400_000 },
  );
  assert.equal((await item(await saved(old.eventId))).body, null);
  const first = await call("/api/whatsapp/inbox?limit=2", operator);
  assert.equal(first.body.items.length, 2);
  assert.ok(first.body.nextCursor);
  const second = await call(
    `/api/whatsapp/inbox?limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    operator,
  );
  assert.equal(
    second.body.items.some((entry: any) =>
      first.body.items.some((previous: any) => entry.id === previous.id),
    ),
    false,
  );
  assert.equal(
    (await call("/api/whatsapp/inbox?limit=1000", operator)).status,
    400,
  );
  assert.equal(
    (await call("/api/whatsapp/inbox?cursor=garbage", operator)).status,
    400,
  );
});

test("legacy outbound messaging cannot use another tenant business account; CRM phone changes clear old authorization", async () => {
  const result = await call(
    "/api/messages",
    other,
    "POST",
    {
      contactId: "arbitrary",
      channel: "whatsapp",
      body: "Unauthorized business account use",
    },
    randomUUID(),
  );
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "CHANNEL_SCOPE_FORBIDDEN");
  const { rows } = await db.query<any>(
    `SELECT version FROM contacts WHERE id='contact-grace'`,
  );
  const version = rows[0].version;
  assert.equal(
    (
      await call("/api/contacts/contact-grace", operator, "PATCH", {
        version,
        phone: "+256700099911",
        consent: true,
      })
    ).body.error.code,
    "CONSENT_RECONFIRM_REQUIRED",
  );
  const changed = await call("/api/contacts/contact-grace", operator, "PATCH", {
    version,
    phone: "+256700099911",
    consent: false,
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.consent, false);
  assert.deepEqual(changed.body.lastInboundAt, {});
  assert.deepEqual(changed.body.consentChannels, []);
});
