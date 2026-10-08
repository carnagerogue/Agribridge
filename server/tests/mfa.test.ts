import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { loadConfig, type AppConfig } from "../config.js";
import { migrate, openDatabase, type Database } from "../db.js";
import {
  base32Decode,
  base32Encode,
  currentStep,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  isRecoveryCode,
  totpCode,
  verifyTotp,
} from "../mfa.js";
import { hashPassword } from "../security.js";

const KEY = randomBytes(32).toString("base64");
const PASSWORD = "correct horse battery staple";

test("TOTP matches the RFC 6238 reference values", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(secret, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  for (const [time, code] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ] as const)
    assert.equal(totpCode(secret, Math.floor(time / 30), 8), code);
  assert.deepEqual(
    base32Decode(base32Encode(Buffer.from("agribridge"))),
    Buffer.from("agribridge"),
  );
});

test("codes are accepted within one step of drift and never twice", () => {
  const secret = base32Encode(randomBytes(20));
  const now = Date.now();
  const step = currentStep(now);
  assert.equal(verifyTotp(secret, totpCode(secret, step), null, now), step);
  assert.equal(
    verifyTotp(secret, totpCode(secret, step - 1), null, now),
    step - 1,
  );
  assert.equal(verifyTotp(secret, totpCode(secret, step - 2), null, now), null);
  assert.equal(verifyTotp(secret, totpCode(secret, step), step, now), null);
  assert.equal(verifyTotp(secret, "12345", null, now), null);
});

test("stored secrets are encrypted and bound to their account", () => {
  const key = randomBytes(32);
  const stored = encryptSecret(key, "user-a", "SECRETBASE32");
  assert.match(stored, /^v1:/);
  assert.equal(stored.includes("SECRETBASE32"), false);
  assert.equal(decryptSecret(key, "user-a", stored), "SECRETBASE32");
  assert.throws(() => decryptSecret(key, "user-b", stored));
  assert.throws(() => decryptSecret(randomBytes(32), "user-a", stored));
  const codes = generateRecoveryCodes();
  assert.equal(new Set(codes).size, 8);
  assert.ok(codes.every(isRecoveryCode));
});

test("production requires a valid encryption key", () => {
  const production = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://db.example/agribridge?sslmode=verify-full",
    PUBLIC_ORIGIN: "https://agri.example",
  };
  assert.throws(() => loadConfig(production), /MFA_ENCRYPTION_KEY/);
  assert.throws(
    () => loadConfig({ ...production, MFA_ENCRYPTION_KEY: "c2hvcnQ=" }),
    /32 bytes/,
  );
  assert.equal(
    loadConfig({ ...production, MFA_ENCRYPTION_KEY: KEY }).mfaKey?.length,
    32,
  );
});

type Client = { cookie: string; csrf: string };
async function harness(
  env: Record<string, string> = { MFA_ENCRYPTION_KEY: KEY },
) {
  const db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await db.query(`INSERT INTO organizations(id,name) VALUES('org','Co-op')`);
  const hash = await hashPassword(PASSWORD);
  for (const [id, role] of [
    ["admin-1", "admin"],
    ["admin-2", "admin"],
    ["farmer-1", "farmer"],
  ])
    await db.query(
      `INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES($1,'org',$1,$2,$3,$4)`,
      [id, `${id}@example.org`, hash, role],
    );
  const config: AppConfig = loadConfig(env);
  const server: Server = createApp(db, config, {}).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  async function call(
    path: string,
    client?: Client,
    method = "GET",
    body?: unknown,
  ) {
    // Many sign-ins from one address: keep the shared limiter out of the way.
    await db.query(`DELETE FROM rate_limits`);
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(client
          ? { cookie: client.cookie, "x-csrf-token": client.csrf }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookie = response.headers.get("set-cookie")?.split(";")[0];
    return {
      status: response.status,
      body: (await response.json()) as any,
      cookie,
    };
  }
  const session = (result: { body: any; cookie?: string }): Client => ({
    cookie: result.cookie!,
    csrf: result.body.csrfToken,
  });
  const login = (id: string) =>
    call("/api/auth/login", undefined, "POST", {
      email: `${id}@example.org`,
      password: PASSWORD,
    });
  async function enroll(id: string) {
    const signedIn = await login(id);
    const client = session(signedIn);
    const setup = await call("/api/auth/mfa/setup", client, "POST", {});
    const secret = setup.body.secret.replaceAll(" ", "");
    const enabled = await call("/api/auth/mfa/enable", client, "POST", {
      code: totpCode(secret, currentStep()),
    });
    assert.equal(enabled.status, 200);
    return { secret, client: session(enabled), enabled };
  }
  return {
    db,
    call,
    login,
    session,
    enroll,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}

test("an administrator must set up two-factor sign-in before anything else", async () => {
  const h = await harness();
  try {
    const signedIn = await h.login("admin-1");
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.user.mfaEnrollmentRequired, true);
    const first = h.session(signedIn);
    const blocked = await h.call("/api/bootstrap", first);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, "MFA_ENROLLMENT_REQUIRED");
    assert.equal((await h.call("/api/auth/session", first)).status, 200);

    const setup = await h.call("/api/auth/mfa/setup", first, "POST", {});
    assert.equal(setup.status, 200);
    assert.match(setup.body.otpauthUri, /^otpauth:\/\/totp\/Agribridge:/);
    const secret = setup.body.secret.replaceAll(" ", "");
    const { rows } = await h.db.query<any>(
      `SELECT mfa_pending_secret FROM users WHERE id='admin-1'`,
    );
    assert.match(rows[0].mfa_pending_secret, /^v1:/);
    assert.equal(rows[0].mfa_pending_secret.includes(secret), false);

    const wrong = await h.call("/api/auth/mfa/enable", first, "POST", {
      code: "000000",
    });
    assert.equal(wrong.status, 400);
    const enabled = await h.call("/api/auth/mfa/enable", first, "POST", {
      code: totpCode(secret, currentStep()),
    });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.recoveryCodes.length, 8);
    assert.equal(enabled.body.user.mfaEnrollmentRequired, false);
    assert.equal(enabled.body.user.mfaEnabled, true);
    // The session opened before two-factor sign-in was signed out.
    assert.equal((await h.call("/api/auth/session", first)).status, 401);
    const after = h.session(enabled);
    assert.equal((await h.call("/api/bootstrap", after)).status, 200);
  } finally {
    await h.close();
  }
});

test("sign-in needs a fresh code once two-factor sign-in is set up", async () => {
  const h = await harness();
  try {
    const { secret } = await h.enroll("admin-1");
    const password = await h.login("admin-1");
    assert.equal(password.status, 200);
    assert.equal(password.body.mfaRequired, true);
    assert.equal(password.cookie, undefined);
    assert.equal(password.body.user, undefined);
    const code = totpCode(secret, currentStep() + 1);
    const verified = await h.call("/api/auth/mfa/verify", undefined, "POST", {
      challenge: password.body.challenge,
      code,
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.user.id, "admin-1");
    assert.ok(verified.cookie);
    // The same code cannot be used again, even with a new challenge.
    const again = await h.login("admin-1");
    const replay = await h.call("/api/auth/mfa/verify", undefined, "POST", {
      challenge: again.body.challenge,
      code,
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, "INVALID_MFA_CODE");
    // The challenge itself is single use.
    const reused = await h.call("/api/auth/mfa/verify", undefined, "POST", {
      challenge: password.body.challenge,
      code: totpCode(secret, currentStep()),
    });
    assert.equal(reused.body.error.code, "MFA_CHALLENGE_EXPIRED");
  } finally {
    await h.close();
  }
});

test("a challenge allows five attempts", async () => {
  const h = await harness();
  try {
    const { secret } = await h.enroll("admin-1");
    const { body } = await h.login("admin-1");
    for (let attempt = 0; attempt < 5; attempt++) {
      const wrong = await h.call("/api/auth/mfa/verify", undefined, "POST", {
        challenge: body.challenge,
        code: "000000",
      });
      assert.equal(wrong.body.error.code, "INVALID_MFA_CODE");
    }
    const late = await h.call("/api/auth/mfa/verify", undefined, "POST", {
      challenge: body.challenge,
      code: totpCode(secret, currentStep() + 1),
    });
    assert.equal(late.body.error.code, "MFA_CHALLENGE_EXPIRED");
  } finally {
    await h.close();
  }
});

test("each recovery code signs in once", async () => {
  const h = await harness();
  try {
    const { enabled } = await h.enroll("admin-1");
    const [code] = enabled.body.recoveryCodes;
    const first = await h.login("admin-1");
    const used = await h.call("/api/auth/mfa/verify", undefined, "POST", {
      challenge: first.body.challenge,
      code: code.toUpperCase(),
    });
    assert.equal(used.status, 200);
    assert.equal(used.body.recoveryCodesRemaining, 7);
    const second = await h.login("admin-1");
    const reused = await h.call("/api/auth/mfa/verify", undefined, "POST", {
      challenge: second.body.challenge,
      code,
    });
    assert.equal(reused.body.error.code, "INVALID_MFA_CODE");
    const audit = await h.db.query<{ action: string }>(
      `SELECT action FROM audit_events WHERE action LIKE 'auth.mfa%' ORDER BY created_at`,
    );
    assert.ok(
      audit.rows.some((row) => row.action === "auth.mfa_recovery_code_used"),
    );
    const stored = JSON.stringify(
      (await h.db.query(`SELECT * FROM mfa_recovery_codes`)).rows,
    );
    for (const recovery of enabled.body.recoveryCodes)
      assert.equal(stored.includes(recovery), false);
  } finally {
    await h.close();
  }
});

test("another administrator can reset a lost authenticator", async () => {
  const h = await harness();
  try {
    const target = await h.enroll("admin-1");
    const { client: actor } = await h.enroll("admin-2");
    const members = await h.call("/api/admin/users", actor);
    assert.equal(
      members.body.find((member: any) => member.id === "admin-1").mfaEnabled,
      true,
    );
    const self = await h.call("/api/admin/users/admin-2/mfa", actor, "DELETE");
    assert.equal(self.body.error.code, "SELF_ACCESS_CHANGE");
    const reset = await h.call("/api/admin/users/admin-1/mfa", actor, "DELETE");
    assert.equal(reset.status, 200);
    assert.equal(reset.body.mfaEnabled, false);
    assert.equal(
      (await h.call("/api/auth/session", target.client)).status,
      401,
    );
    const signedIn = await h.login("admin-1");
    assert.equal(signedIn.body.user.mfaEnrollmentRequired, true);
  } finally {
    await h.close();
  }
});

test("farmers and demo administrators are not asked for a second factor", async () => {
  const h = await harness();
  try {
    const farmer = await h.login("farmer-1");
    assert.equal(farmer.body.user.mfaEnrollmentRequired, false);
    assert.equal(
      (await h.call("/api/bootstrap", h.session(farmer))).status,
      200,
    );
  } finally {
    await h.close();
  }
  const demo = await harness({
    MFA_ENCRYPTION_KEY: KEY,
    AGRIBRIDGE_DEMO: "true",
  });
  try {
    assert.equal(
      (await demo.login("admin-1")).body.user.mfaEnrollmentRequired,
      false,
    );
  } finally {
    await demo.close();
  }
});

test("an enrolled account cannot sign in with a password alone when the key is missing", async () => {
  const h = await harness();
  const db = h.db;
  await h.enroll("admin-1");
  const keyless = createApp(db, loadConfig({}), {}).listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => keyless.once("listening", resolve));
    const port = (keyless.address() as { port: number }).port;
    await db.query(`DELETE FROM rate_limits`);
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin-1@example.org",
        password: PASSWORD,
      }),
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(
      ((await response.json()) as any).error.code,
      "MFA_UNAVAILABLE",
    );
  } finally {
    await new Promise<void>((resolve) => keyless.close(() => resolve()));
    await h.close();
  }
});
