import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrate, type Database } from "../db.js";
import { seedDemo, DEMO_TENANT } from "../seed.js";
import { hashPassword } from "../security.js";
import { createWeatherService, createWarningsService } from "../weather.js";
import { createChannelBridge } from "../channel-bridge.js";
import { assistantBudget } from "../ai-budget.js";
import { reserveMessageBudget } from "../messaging-budget.js";
import { getLessons } from "../lesson-editorial.js";
import { selectGroundingSources } from "../ai/index.js";

let db: Database, server: Server, url: string;
type Client = { cookie: string; csrf: string; user: any };
let farmer: Client, operator: Client;
async function call(
  path: string,
  options: {
    client?: Client;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...options.headers,
  };
  if (options.client) {
    headers.cookie = options.client.cookie;
    headers["x-csrf-token"] = options.client.csrf;
  }
  const response = await fetch(`${url}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    body: (await response.json()) as any,
    response,
  };
}
async function demo(role: string) {
  const result = await call("/api/auth/demo", {
    method: "POST",
    body: { role },
  });
  assert.equal(result.status, 200);
  return {
    cookie: result.response.headers.get("set-cookie")!.split(";")[0],
    csrf: result.body.csrfToken,
    user: result.body.user,
  };
}
before(async () => {
  const config = loadConfig({ AGRIBRIDGE_DEMO: "true" });
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await seedDemo(db);
  server = createApp(db, config, {}).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as any;
  url = `http://127.0.0.1:${address.port}`;
  farmer = await demo("farmer");
  operator = await demo("operator");
});
after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await db.close();
});

test("production fails closed on demo, local DB and insecure public origin", () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: "production", AGRIBRIDGE_DEMO: "true" }),
    /Demo mode/,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        PUBLIC_ORIGIN: "https://agri.test",
      }),
    /PostgreSQL/,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://database",
      }),
    /HTTPS/,
  );
  assert.throws(
    () => loadConfig({ AGRIBRIDGE_DEMO: "true", HOST: "0.0.0.0" }),
    /loopback/,
  );
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://example.test/db?sslmode=disable",
        PUBLIC_ORIGIN: "https://agri.test",
      }),
    /TLS/,
  );
  assert.equal(
    loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://example.test/db",
      PUBLIC_ORIGIN: "https://agri.test",
      MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    }).databaseTls,
    true,
  );
});
test("anonymous bootstrap blocked, public lessons clearly drafts", async () => {
  assert.equal((await call("/api/bootstrap")).status, 401);
  const guides = await call("/api/lessons");
  assert.equal(guides.status, 200);
  assert.ok(
    guides.body.every(
      (item: any) =>
        item.reviewStatus === "draft" && item.sourceUrl.startsWith("https://"),
    ),
  );
});
test("sessions use HttpOnly cookie and role comes from server", async () => {
  const result = await call("/api/auth/demo", {
    method: "POST",
    body: { role: "farmer" },
  });
  assert.match(result.response.headers.get("set-cookie")!, /HttpOnly/);
  assert.match(result.response.headers.get("set-cookie")!, /SameSite=Lax/);
  assert.equal(
    (
      await call("/api/auth/demo", {
        method: "POST",
        body: { role: "farmer", organizationId: "override" },
      })
    ).status,
    400,
  );
  await db.query(
    `INSERT INTO users(id,tenant_id,name,email,role) VALUES('unprovisioned',$1,'Unprovisioned','unprovisioned@example.test','farmer')`,
    [DEMO_TENANT],
  );
  assert.equal(
    (
      await call("/api/auth/login", {
        method: "POST",
        body: {
          email: "unprovisioned@example.test",
          password: "No-user-password-comparison-only",
        },
      })
    ).status,
    401,
  );
});
test("farmer bootstrap hides CRM, other farms and other reports", async () => {
  const result = await call("/api/bootstrap", { client: farmer });
  assert.equal(result.status, 200);
  assert.equal(result.body.farms.length, 2);
  assert.equal(result.body.contacts.length, 0);
  assert.equal(result.body.deals.length, 0);
  assert.equal(result.body.reports.length, 1);
  assert.equal(
    result.body.farms.find((item: any) => item.id === "farm-peter-coffee"),
    undefined,
  );
});
test("CSRF and cross-origin requests rejected before mutation", async () => {
  const settings = {
    language: "en",
    lowDataMode: true,
    preferredChannel: "sms",
    notifications: false,
  };
  assert.equal(
    (
      await call("/api/settings", {
        method: "PUT",
        headers: { cookie: farmer.cookie },
        body: settings,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/settings", {
        client: farmer,
        method: "PUT",
        headers: { origin: "https://attacker.test" },
        body: settings,
      })
    ).status,
    403,
  );
});
test("farmer cannot manage contacts, other farms or report triage", async () => {
  assert.equal((await call("/api/contacts", { client: farmer })).status, 403);
  assert.equal(
    (
      await call("/api/farms/farm-peter-coffee", {
        client: farmer,
        method: "PATCH",
        body: { version: 1, name: "Stolen" },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call("/api/reports/report-water", {
        client: farmer,
        method: "PATCH",
        body: { version: 1, status: "resolved" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/tasks/task-scout", {
        client: operator,
        method: "PATCH",
        body: { version: 1, farmId: "farm-peter-coffee" },
      })
    ).body.error.code,
    "TASK_OWNER_CONFLICT",
  );
});
test("create replay deduplicates, changed payload rejected, optimistic conflicts preserved", async () => {
  const key = randomUUID();
  const body = {
    farmId: "farm-grace-maize",
    title: "Test durable scouting",
    dueDate: "2026-09-29",
    category: "scouting",
    status: "pending",
    notes: "Important scouting observations must survive status updates.",
  };
  const first = await call("/api/tasks", {
    client: farmer,
    method: "POST",
    body,
    headers: { "Idempotency-Key": key },
  });
  assert.equal(first.status, 201);
  const replay = await call("/api/tasks", {
    client: farmer,
    method: "POST",
    body,
    headers: { "Idempotency-Key": key },
  });
  assert.equal(replay.body.id, first.body.id);
  assert.equal(
    (
      await call("/api/tasks", {
        client: farmer,
        method: "POST",
        body: { ...body, title: "Different" },
        headers: { "Idempotency-Key": key },
      })
    ).status,
    409,
  );
  const update = await call(`/api/tasks/${first.body.id}`, {
    client: farmer,
    method: "PATCH",
    body: { version: 1, status: "completed" },
  });
  assert.equal(update.status, 200);
  assert.equal(update.body.version, 2);
  assert.equal(update.body.title, body.title);
  assert.equal(update.body.farmId, body.farmId);
  assert.equal(update.body.notes, body.notes);
  assert.equal(update.body.category, body.category);
  assert.equal(
    (
      await call(`/api/tasks/${first.body.id}`, {
        client: farmer,
        method: "PATCH",
        body: { version: 1, status: "pending" },
      })
    ).status,
    409,
  );
});
test("strict allowlist rejects ownership injection and invalid date", async () => {
  assert.equal(
    (
      await call("/api/tasks/task-scout", {
        client: farmer,
        method: "PATCH",
        body: { version: 1, owner_id: "other" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/api/tasks", {
        client: farmer,
        method: "POST",
        body: { title: "Invalid", dueDate: "2026-02-31", category: "general" },
      })
    ).status,
    400,
  );
});
test("quiz graded on server, false completion claims rejected", async () => {
  const wrong = await call("/api/progress/maize-season", {
    client: farmer,
    method: "PUT",
    body: { answerIndex: 0 },
  });
  assert.equal(wrong.body.completed, false);
  assert.equal(wrong.body.score, 0);
  const right = await call("/api/progress/maize-season", {
    client: farmer,
    method: "PUT",
    body: { answerIndex: 1 },
  });
  assert.equal(right.body.completed, true);
  assert.equal(right.body.score, 100);
  assert.equal(
    (
      await call("/api/progress/maize-season", {
        client: farmer,
        method: "PUT",
        body: { answerIndex: 0, completed: true },
      })
    ).status,
    400,
  );
});
test("tenant isolation holds for administrator account in another organization", async () => {
  await db.query(
    `INSERT INTO organizations(id,name) VALUES('org-other','Other organization')`,
  );
  await db.query(
    `INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES('user-other','org-other','Other Admin','other@example.test',$1,'admin')`,
    [await hashPassword("Very-long-test-password!")],
  );
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: "other@example.test", password: "Very-long-test-password!" },
  });
  assert.equal(login.status, 200);
  const other = {
    cookie: login.response.headers.get("set-cookie")!.split(";")[0],
    csrf: login.body.csrfToken,
    user: login.body.user,
  };
  assert.equal(
    (await call("/api/bootstrap", { client: other })).body.farms.length,
    0,
  );
  assert.equal(
    (
      await call("/api/farms/farm-grace-maize", {
        client: other,
        method: "PATCH",
        body: { version: 1, name: "Cross tenant" },
      })
    ).status,
    404,
  );
});
test("message consent enforced, demo cannot transmit and idempotent delivery remains truthful", async () => {
  assert.equal(
    (
      await call("/api/messages", {
        client: operator,
        method: "POST",
        body: {
          contactId: "contact-grace",
          channel: "sms",
          body: "A reminder",
        },
      })
    ).status,
    409,
  );
  const contact = await call("/api/contacts/contact-grace", {
    client: operator,
    method: "PATCH",
    body: { version: 1, consent: true },
  });
  assert.equal(contact.status, 200);
  const key = randomUUID();
  const input = {
    contactId: "contact-grace",
    channel: "sms",
    body: "A reminder",
  };
  const sent = await call("/api/messages", {
    client: operator,
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": key },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.status, "not_configured");
  const replay = await call("/api/messages", {
    client: operator,
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": key },
  });
  assert.equal(replay.body.id, sent.body.id);
  assert.equal(replay.body.status, "not_configured");
});
test("verified callbacks persist dedupe and STOP withdrawal atomically", async () => {
  const bridge = createChannelBridge(db, {
    CHANNEL_ORGANIZATION_ID: DEMO_TENANT,
  });
  const event = {
    eventId: "stop-test-1",
    channel: "sms" as const,
    provider: "africas_talking" as const,
    from: "+256700000001",
    body: "STOP",
    command: "stop" as const,
    occurredAt: new Date().toISOString(),
  };
  await bridge.handleInbound(event);
  const first = await db.query<any>(
    `SELECT version,consent FROM contacts WHERE id='contact-grace'`,
  );
  await bridge.handleInbound(event);
  const second = await db.query<any>(
    `SELECT version,consent FROM contacts WHERE id='contact-grace'`,
  );
  assert.equal(second.rows[0].version, first.rows[0].version);
  assert.equal(second.rows[0].consent, false);
  const request = {
    eventId: "ussd-test-1",
    sessionId: "session-test",
    from: "+256700000001",
    serviceCode: "*123#",
    text: "4*1",
  };
  const response = await bridge.handleUssd(request);
  assert.match(response, /saved/);
  assert.equal(await bridge.handleUssd(request), response);
});
test("provider failure cannot fabricate weather or interpret missing warning service as all clear", async () => {
  const failFetch = async () => {
    throw new Error("offline");
  };
  await assert.rejects(
    () => createWeatherService({}, failFetch as typeof fetch)(0.3, 32.5),
    /Weather is unavailable/,
  );
  await assert.rejects(
    () => createWarningsService(failFetch as typeof fetch)(),
    /does not mean no warnings/,
  );
});
test("USSD weather fetches outside transactions and replays the durable response", async () => {
  let inTransaction = false,
    providerCalls = 0;
  const tracked: Database = {
    ...db,
    async transaction(work) {
      return db.transaction(async (tx) => {
        inTransaction = true;
        try {
          return await work(tx);
        } finally {
          inTransaction = false;
        }
      });
    },
  };
  const fetchImpl = async () => {
    assert.equal(inTransaction, false);
    providerCalls++;
    return new Response(
      JSON.stringify({
        current: { temperature_2m: 24, weather_code: 2 },
        daily: {
          time: ["2026-09-28"],
          temperature_2m_min: [19],
          temperature_2m_max: [28],
          precipitation_probability_max: [50],
          precipitation_sum: [3],
        },
      }),
      { status: 200 },
    );
  };
  const bridge = createChannelBridge(
    tracked,
    { CHANNEL_ORGANIZATION_ID: DEMO_TENANT },
    fetchImpl as typeof fetch,
  );
  const request = {
    eventId: "ussd-weather-transaction-test",
    sessionId: "weather-test",
    from: "+256700000001",
    serviceCode: "*123#",
    text: "1*1",
  };
  const response = await bridge.handleUssd(request);
  assert.match(response, /Kampala/);
  assert.equal(providerCalls, 1);
  assert.equal(await bridge.handleUssd(request), response);
  assert.equal(providerCalls, 1);
});
test("logout invalidates server session immediately", async () => {
  const temporary = await demo("farmer");
  assert.equal(
    (
      await call("/api/auth/logout", {
        client: temporary,
        method: "POST",
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("/api/bootstrap", { client: temporary })).status,
    401,
  );
});
test("only admins provision users, phone login forces password rotation and revokes old sessions", async () => {
  assert.equal(
    (await call("/api/admin/users", { client: operator })).status,
    403,
  );
  const admin = await demo("admin");
  const input = {
    name: "New Farmer",
    phone: "+256700111222",
    password: "Temporary-test-passphrase",
    role: "farmer",
  };
  const created = await call("/api/admin/users", {
    client: admin,
    method: "POST",
    body: input,
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.passwordChangeRequired, true);
  assert.equal(created.body.password, undefined);
  assert.equal(created.body.password_hash, undefined);
  const login = await call("/api/auth/login", {
    method: "POST",
    body: { email: input.phone, password: input.password },
  });
  assert.equal(login.status, 200);
  const initial = {
    cookie: login.response.headers.get("set-cookie")!.split(";")[0],
    csrf: login.body.csrfToken,
    user: login.body.user,
  };
  assert.equal(
    (await call("/api/bootstrap", { client: initial })).body.error.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  const changed = await call("/api/auth/password", {
    client: initial,
    method: "POST",
    body: {
      currentPassword: input.password,
      newPassword: "A-new-and-different-passphrase",
    },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.passwordChangeRequired, false);
  assert.equal((await call("/api/bootstrap", { client: initial })).status, 401);
  const active = {
    cookie: changed.response.headers.get("set-cookie")!.split(";")[0],
    csrf: changed.body.csrfToken,
    user: changed.body.user,
  };
  assert.equal((await call("/api/bootstrap", { client: active })).status, 200);
  const members = await call("/api/admin/users", { client: admin });
  assert.ok(Array.isArray(members.body));
  assert.ok(
    members.body.every(
      (member: any) =>
        member.password === undefined && member.password_hash === undefined,
    ),
  );
  assert.equal(
    (
      await call(`/api/admin/users/${admin.user.id}`, {
        client: admin,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/admin/users/${created.body.id}`, {
        client: operator,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(`/api/admin/users/${created.body.id}`, {
        client: admin,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    200,
  );
  assert.equal((await call("/api/bootstrap", { client: active })).status, 401);
  assert.equal(
    (
      await call("/api/auth/login", {
        method: "POST",
        body: {
          email: input.phone,
          password: "A-new-and-different-passphrase",
        },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(`/api/admin/users/${created.body.id}`, {
        client: admin,
        method: "PATCH",
        body: { active: true },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("/api/auth/login", {
        method: "POST",
        body: {
          email: input.phone,
          password: "A-new-and-different-passphrase",
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(`/api/admin/users/user-other`, {
        client: admin,
        method: "PATCH",
        body: { active: false },
      })
    ).status,
    404,
  );
});
test("AI budgets are atomic and durable across service instances", async () => {
  const limit = { dailyLimit: 3, perUserLimit: 2, date: "2030-01-01" };
  const budget = assistantBudget(db, farmer.user);
  const results = await Promise.all([
    budget.reserve(limit),
    budget.reserve(limit),
    budget.reserve(limit),
    budget.reserve(limit),
  ]);
  assert.equal(results.filter((item) => item.allowed).length, 2);
  assert.equal(await assistantBudget(db, farmer.user).remaining(limit), 0);
  const operatorBudget = assistantBudget(db, operator.user);
  assert.equal((await operatorBudget.reserve(limit)).allowed, true);
  assert.equal((await operatorBudget.reserve(limit)).allowed, false);
  assert.equal(
    (await call("/api/assistant/status", { client: farmer })).body.configured,
    false,
  );
  const result = await call("/api/assistant", {
    client: farmer,
    method: "POST",
    body: {
      question: "How should I scout maize?",
      crop: "Maize",
      consent: true,
    },
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, "ai_not_configured");
});
test("delivery receipts survive early arrival and never regress delivered state", async () => {
  const bridge = createChannelBridge(db, {
    CHANNEL_ORGANIZATION_ID: DEMO_TENANT,
  });
  const base = {
    channel: "sms" as const,
    provider: "africas_talking" as const,
    providerId: "provider-early",
    occurredAt: new Date().toISOString(),
  };
  await bridge.handleDelivery({
    ...base,
    eventId: "early-delivered",
    status: "delivered",
  });
  await bridge.handleDelivery({
    ...base,
    eventId: "late-sent",
    status: "sent",
  });
  const { rows } = await db.query<{ status: string }>(
    `SELECT status FROM channel_deliveries WHERE tenant_id=$1 AND provider_id=$2`,
    [DEMO_TENANT, base.providerId],
  );
  assert.equal(rows[0].status, "delivered");
});
test("messaging recipient and global limits survive concurrent requests", async () => {
  const env = {
    MESSAGING_DAILY_LIMIT: "3",
    MESSAGING_TENANT_DAILY_LIMIT: "3",
    MESSAGING_RECIPIENT_DAILY_LIMIT: "2",
  };
  const values = await Promise.all(
    [1, 2, 3, 4].map(() =>
      reserveMessageBudget(db, DEMO_TENANT, "+256700111999", env, "2030-02-01"),
    ),
  );
  assert.equal(values.filter(Boolean).length, 2);
  assert.equal(
    await reserveMessageBudget(
      db,
      DEMO_TENANT,
      "+256700111998",
      env,
      "2030-02-01",
    ),
    true,
  );
  assert.equal(
    await reserveMessageBudget(
      db,
      DEMO_TENANT,
      "+256700111997",
      env,
      "2030-02-01",
    ),
    false,
  );
});
test("lesson editorial requires explicit qualified-review attestation and preserves tenant boundaries", async () => {
  const admin = await demo("admin");
  const route = "/api/admin/lessons/maize-season";
  assert.equal(
    (await call("/api/admin/lessons", { client: operator })).status,
    403,
  );
  assert.equal(
    (
      await call(route, {
        client: farmer,
        method: "PUT",
        body: { version: 1, reviewStatus: "reviewed" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(route, {
        client: admin,
        method: "PUT",
        body: { version: 1, reviewStatus: "reviewed" },
      })
    ).body.error.code,
    "REVIEW_ATTESTATION_REQUIRED",
  );
  assert.equal(
    (
      await call(route, {
        client: admin,
        method: "PUT",
        body: { version: 1, sourceUrl: "https://untrusted.example/guide" },
      })
    ).status,
    400,
  );
  const key = randomUUID();
  const review = {
    version: 1,
    reviewStatus: "reviewed",
    reviewerName: "Test Agronomist",
    reviewerQualification: "District crop extension specialist",
    reviewNotes:
      "Reviewed for source accuracy and local applicability for this test only.",
    reviewConfirmed: true,
  };
  const approved = await call(route, {
    client: admin,
    method: "PUT",
    body: review,
    headers: { "Idempotency-Key": key },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.reviewStatus, "reviewed");
  assert.equal(approved.body.version, 2);
  assert.equal(approved.body.reviewAttestation, true);
  assert.ok(approved.body.reviewedAt);
  assert.equal(approved.body.reviewRecordedBy, admin.user.name);
  const replay = await call(route, {
    client: admin,
    method: "PUT",
    body: review,
    headers: { "Idempotency-Key": key },
  });
  assert.equal(replay.body.version, 2);
  const authenticated = await call("/api/lessons", { client: farmer });
  assert.equal(
    authenticated.body.find((lesson: any) => lesson.id === "maize-season")
      .reviewStatus,
    "reviewed",
  );
  const publicGuides = await call("/api/lessons");
  assert.equal(
    publicGuides.body.find((lesson: any) => lesson.id === "maize-season")
      .reviewStatus,
    "draft",
  );
  const otherTenant = await getLessons(db, "org-other");
  assert.equal(
    otherTenant.find((lesson) => lesson.id === "maize-season")!.reviewStatus,
    "draft",
  );
  const corpus = await getLessons(db, DEMO_TENANT);
  const approvedSources = selectGroundingSources(
    { question: "Plan a maize season", crop: "Maize", consent: true },
    {
      lessons: corpus,
      reserveBudget: async () => ({ allowed: false, remaining: 0 }),
    },
    { NODE_ENV: "production" },
    Date.now(),
  );
  assert.equal(approvedSources.length, 1);
  assert.equal(approvedSources[0].draft, false);
  const bridge = createChannelBridge(db, {
    CHANNEL_ORGANIZATION_ID: DEMO_TENANT,
  });
  const guide = await bridge.handleUssd({
    eventId: "reviewed-guide",
    sessionId: "learning-test",
    from: "+256700000001",
    serviceCode: "*123#",
    text: "3*1",
  });
  assert.match(guide, /Choose a suitable variety/);
  const bootstrap = await call("/api/bootstrap", { client: farmer });
  assert.equal(
    bootstrap.body.progress.find(
      (progress: any) => progress.lessonId === "maize-season",
    ).needsReview,
    true,
  );
  const edit = await call(route, {
    client: admin,
    method: "PUT",
    body: { version: 2, title: "Plan and record a maize season" },
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.reviewStatus, "draft");
  assert.equal(edit.body.reviewedAt, null);
  assert.equal(edit.body.reviewerName, null);
  assert.equal(edit.body.version, 3);
  assert.equal(
    (
      await call(route, {
        client: admin,
        method: "PUT",
        body: { version: 2, reviewStatus: "draft" },
      })
    ).status,
    409,
  );
  const after = selectGroundingSources(
    { question: "Plan a maize season", crop: "Maize", consent: true },
    {
      lessons: await getLessons(db, DEMO_TENANT),
      reserveBudget: async () => ({ allowed: false, remaining: 0 }),
    },
    { NODE_ENV: "production" },
    Date.now(),
  );
  assert.equal(after.length, 0);
  const history = await db.query(
    `SELECT version FROM lesson_history WHERE tenant_id=$1 AND lesson_id='maize-season' ORDER BY version`,
    [DEMO_TENANT],
  );
  assert.deepEqual(
    history.rows.map((row: any) => row.version),
    [2, 3],
  );
});
