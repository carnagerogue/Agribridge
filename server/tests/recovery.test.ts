import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { loadConfig } from "../config.js";
import { migrate, openDatabase } from "../db.js";
import { encryptSecret, generateTotpSecret } from "../mfa.js";
import { hashPassword } from "../security.js";

const OLD_PASSWORD = "original account passphrase";
const NEW_PASSWORD = "a brand new account passphrase";
const KEY = randomBytes(32);
const SMS_ENV = {
  AT_API_KEY: "test-key",
  AT_USERNAME: "sandbox",
  AT_SENDER_ID: "AGRIBRIDGE",
  AT_ENVIRONMENT: "sandbox",
};
const FARMER = "+256700000101";
const ADMIN = "+256700000102";

async function harness(
  env: Record<string, string> = {
    ...SMS_ENV,
    MFA_ENCRYPTION_KEY: KEY.toString("base64"),
  },
) {
  const db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await db.query(`INSERT INTO organizations(id,name) VALUES('org','Co-op')`);
  const hash = await hashPassword(OLD_PASSWORD);
  await db.query(
    `INSERT INTO users(id,tenant_id,name,phone,password_hash,role) VALUES('farmer','org','Farmer',$1,$2,'farmer'),('admin','org','Admin',$3,$2,'admin')`,
    [FARMER, hash, ADMIN],
  );
  // The administrator already uses two-factor sign-in.
  await db.query(
    `UPDATE users SET mfa_secret=$1,mfa_enabled_at=now() WHERE id='admin'`,
    [encryptSecret(KEY, "admin", generateTotpSecret())],
  );
  const sent: { to: string; message: string }[] = [];
  const smsFetch = (async (_url: string, init: RequestInit) => {
    const form = new URLSearchParams(String(init.body));
    sent.push({ to: form.get("to")!, message: form.get("message")! });
    return Response.json({
      SMSMessageData: {
        Recipients: [
          {
            number: form.get("to"),
            messageId: `ATXid_${sent.length}`,
            statusCode: 101,
          },
        ],
      },
    });
  }) as unknown as typeof fetch;
  const server: Server = createApp(db, loadConfig(env), env, {
    smsFetch,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  async function call(
    path: string,
    body?: unknown,
    options: { cookie?: string; csrf?: string; keepLimits?: boolean } = {},
  ) {
    if (!options.keepLimits) await db.query(`DELETE FROM rate_limits`);
    const response = await fetch(`${url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.csrf ? { "x-csrf-token": options.csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as any,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function codeFor(phone: string, count = 1) {
    for (let wait = 0; wait < 100; wait++) {
      const messages = sent.filter((message) => message.to === phone);
      if (messages.length >= count)
        return messages[count - 1].message.match(/\b(\d{6})\b/)![1];
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("No code was sent.");
  }
  const request = (phone: string, keepLimits = false) =>
    call("/api/auth/recovery/request", { phone }, { keepLimits });
  const confirm = (phone: string, code: string, newPassword = NEW_PASSWORD) =>
    call("/api/auth/recovery/confirm", { phone, code, newPassword });
  const login = (phone: string, password: string) =>
    call("/api/auth/login", { email: phone, password });
  return {
    db,
    sent,
    call,
    codeFor,
    request,
    confirm,
    login,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

test("a code sent by SMS resets the password once and ends old sessions", async () => {
  const h = await harness();
  try {
    const before = await h.login(FARMER, OLD_PASSWORD);
    assert.equal(before.status, 200);
    const requested = await h.request(FARMER);
    assert.equal(requested.status, 202);
    const code = await h.codeFor(FARMER);
    const [message] = h.sent;
    assert.match(message.message, /Never share it/);
    const stored = JSON.stringify(
      (await h.db.query(`SELECT * FROM password_resets`)).rows,
    );
    assert.equal(stored.includes(code), false);

    const wrong = await h.confirm(
      FARMER,
      code === "000000" ? "111111" : "000000",
    );
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, "INVALID_RESET_CODE");
    const reset = await h.confirm(FARMER, code);
    assert.equal(reset.status, 200);
    assert.equal(reset.body.user.id, "farmer");
    assert.ok(reset.cookie);
    // The session opened before the reset no longer works.
    assert.equal(
      (await h.call("/api/auth/session", undefined, { cookie: before.cookie }))
        .status,
      401,
    );
    assert.equal((await h.login(FARMER, OLD_PASSWORD)).status, 401);
    assert.equal((await h.login(FARMER, NEW_PASSWORD)).status, 200);
    assert.equal(
      (await h.confirm(FARMER, code, "yet another account passphrase")).status,
      401,
    );
    const audit = await h.db.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE entity_id='farmer'`,
    );
    assert.ok(audit.rows.some((row) => row.action === "auth.password_reset"));
  } finally {
    await h.close();
  }
});

test("unknown numbers get the same answer and no message", async () => {
  const h = await harness();
  try {
    const known = await h.request(FARMER);
    const unknown = await h.request("+256700000199");
    assert.equal(unknown.status, known.status);
    assert.deepEqual(unknown.body, known.body);
    await h.codeFor(FARMER);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(
      h.sent.some((message) => message.to === "+256700000199"),
      false,
    );
  } finally {
    await h.close();
  }
});

test("five wrong codes, or a newer code, end the old one", async () => {
  const h = await harness();
  try {
    await h.request(FARMER);
    const first = await h.codeFor(FARMER);
    const wrong = first === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 5; attempt++)
      assert.equal((await h.confirm(FARMER, wrong)).status, 401);
    assert.equal((await h.confirm(FARMER, first)).status, 401);

    await h.request(FARMER);
    const second = await h.codeFor(FARMER, 2);
    await h.request(FARMER);
    const third = await h.codeFor(FARMER, 3);
    if (second !== third)
      assert.equal((await h.confirm(FARMER, second)).status, 401);
    assert.equal((await h.confirm(FARMER, third)).status, 200);
  } finally {
    await h.close();
  }
});

test("a reset does not bypass two-factor sign-in", async () => {
  const h = await harness();
  try {
    await h.request(ADMIN);
    const reset = await h.confirm(ADMIN, await h.codeFor(ADMIN));
    assert.equal(reset.status, 200);
    assert.equal(reset.body.mfaRequired, true);
    assert.match(reset.body.challenge, /^[a-f0-9]{64}$/);
    assert.equal(reset.cookie, undefined);
    assert.equal(reset.body.user, undefined);
  } finally {
    await h.close();
  }
});

test("each number receives at most three codes an hour", async () => {
  const h = await harness();
  try {
    for (let request = 0; request < 3; request++)
      assert.equal((await h.request(FARMER, true)).status, 202);
    const limited = await h.request(FARMER, true);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.code, "RATE_LIMITED");
  } finally {
    await h.close();
  }
});

test("recovery is unavailable without SMS or in the demo", async () => {
  const environments: Record<string, string>[] = [
    { MFA_ENCRYPTION_KEY: KEY.toString("base64") },
    { ...SMS_ENV, AGRIBRIDGE_DEMO: "true" },
  ];
  for (const env of environments) {
    const h = await harness(env);
    try {
      const response = await h.request(FARMER);
      assert.equal(response.status, 503);
      assert.equal(response.body.error.code, "RECOVERY_UNAVAILABLE");
      assert.equal(h.sent.length, 0);
    } finally {
      await h.close();
    }
  }
});

test("an administrator can set a temporary password for someone else", async () => {
  // Without an MFA key the administrator is not asked for a second factor.
  const h = await harness(SMS_ENV);
  try {
    await h.db.query(
      `UPDATE users SET mfa_secret=NULL,mfa_enabled_at=NULL WHERE id='admin'`,
    );
    const farmerSession = await h.login(FARMER, OLD_PASSWORD);
    const admin = await h.login(ADMIN, OLD_PASSWORD);
    const auth = { cookie: admin.cookie, csrf: admin.body.csrfToken };
    const self = await h.call(
      "/api/admin/users/admin/password",
      { password: NEW_PASSWORD },
      auth,
    );
    assert.equal(self.body.error.code, "SELF_ACCESS_CHANGE");
    const updated = await h.call(
      "/api/admin/users/farmer/password",
      { password: NEW_PASSWORD },
      auth,
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.passwordChangeRequired, true);
    assert.equal(
      (
        await h.call("/api/auth/session", undefined, {
          cookie: farmerSession.cookie,
        })
      ).status,
      401,
    );
    const temporary = await h.login(FARMER, NEW_PASSWORD);
    assert.equal(temporary.body.user.passwordChangeRequired, true);
  } finally {
    await h.close();
  }
});
