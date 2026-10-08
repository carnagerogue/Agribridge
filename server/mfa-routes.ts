import { randomBytes } from "node:crypto";
import type { Express, RequestHandler, Response } from "express";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Database, Queryable } from "./db.js";
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  isRecoveryCode,
  otpauthUri,
  recoveryCodeHash,
  verifyTotp,
} from "./mfa.js";
import {
  ApiError,
  createSession,
  sha256,
  type AuthRequest,
  type User,
} from "./security.js";
import { audit } from "./store.js";

const CHALLENGE_MINUTES = 5;
const CHALLENGE_ATTEMPTS = 5;

const unavailable = () =>
  new ApiError(
    503,
    "MFA_UNAVAILABLE",
    "Two-factor sign-in is not available on this server. An administrator must configure MFA_ENCRYPTION_KEY.",
  );
const invalidCode = () =>
  new ApiError(
    401,
    "INVALID_MFA_CODE",
    "That code is not valid. Use the newest code from your authenticator app, or a recovery code.",
  );

/** The second sign-in step for an account with two-factor sign-in. */
export async function startMfaChallenge(db: Queryable, userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.query(`DELETE FROM mfa_challenges WHERE expires_at < now()`);
  await db.query(
    `INSERT INTO mfa_challenges(token_hash,user_id,expires_at) VALUES($1,$2,now()+make_interval(mins=>$3))`,
    [sha256(token), userId, CHALLENGE_MINUTES],
  );
  return token;
}

/** Removes two-factor sign-in and signs the account out everywhere. */
export async function resetMfa(tx: Queryable, userId: string) {
  await tx.query(
    `UPDATE users SET mfa_secret=NULL,mfa_pending_secret=NULL,mfa_enabled_at=NULL,mfa_last_step=NULL WHERE id=$1`,
    [userId],
  );
  await tx.query(`DELETE FROM mfa_recovery_codes WHERE user_id=$1`, [userId]);
  await tx.query(`DELETE FROM mfa_challenges WHERE user_id=$1`, [userId]);
  await tx.query(`DELETE FROM sessions WHERE user_id=$1`, [userId]);
}

/** POST /api/auth/mfa/verify: completes sign-in. Mount before authentication. */
export function mountMfaSignIn(
  app: Express,
  db: Database,
  config: AppConfig,
  limiter: RequestHandler,
) {
  app.post("/api/auth/mfa/verify", limiter, async (req, res: Response) => {
    const input = z
      .object({
        challenge: z.string().regex(/^[a-f0-9]{64}$/),
        code: z.string().trim().min(6).max(20),
      })
      .strict()
      .parse(req.body);
    const key = config.mfaKey;
    if (!key) throw unavailable();
    // Count the attempt even when the code is wrong: never throw inside here.
    const outcome = await db.transaction(async (tx) => {
      const { rows } = await tx.query<any>(
        `SELECT c.user_id,c.attempts,u.mfa_secret,u.mfa_last_step FROM mfa_challenges c JOIN users u ON u.id=c.user_id WHERE c.token_hash=$1 AND c.expires_at>now() AND u.active=true FOR UPDATE OF c,u`,
        [sha256(input.challenge)],
      );
      const row = rows[0];
      if (!row?.mfa_secret) return { status: "expired" as const };
      let step: number | null = null;
      let recovery = false;
      if (isRecoveryCode(input.code)) {
        const used = await tx.query(
          `UPDATE mfa_recovery_codes SET used_at=now() WHERE user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING code_hash`,
          [row.user_id, recoveryCodeHash(row.user_id, input.code)],
        );
        recovery = used.rows.length === 1;
      } else
        step = verifyTotp(
          decryptSecret(key, row.user_id, row.mfa_secret),
          input.code,
          row.mfa_last_step === null ? null : Number(row.mfa_last_step),
        );
      if (step === null && !recovery) {
        if (row.attempts + 1 >= CHALLENGE_ATTEMPTS)
          await tx.query(`DELETE FROM mfa_challenges WHERE token_hash=$1`, [
            sha256(input.challenge),
          ]);
        else
          await tx.query(
            `UPDATE mfa_challenges SET attempts=attempts+1 WHERE token_hash=$1`,
            [sha256(input.challenge)],
          );
        return { status: "invalid" as const };
      }
      await tx.query(`DELETE FROM mfa_challenges WHERE token_hash=$1`, [
        sha256(input.challenge),
      ]);
      if (step !== null)
        await tx.query(`UPDATE users SET mfa_last_step=$2 WHERE id=$1`, [
          row.user_id,
          step,
        ]);
      const remaining = await tx.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM mfa_recovery_codes WHERE user_id=$1 AND used_at IS NULL`,
        [row.user_id],
      );
      return {
        status: "verified" as const,
        userId: row.user_id as string,
        recovery,
        recoveryCodesRemaining: remaining.rows[0].count,
      };
    });
    if (outcome.status === "expired")
      throw new ApiError(
        401,
        "MFA_CHALLENGE_EXPIRED",
        "This sign-in has expired. Enter your password again.",
      );
    if (outcome.status === "invalid") throw invalidCode();
    const session = await createSession(db, config, res, outcome.userId);
    await audit(
      db,
      session.user,
      outcome.recovery ? "auth.mfa_recovery_code_used" : "auth.mfa_verified",
      "sessions",
    );
    res.json({
      ...session,
      ...(outcome.recovery
        ? { recoveryCodesRemaining: outcome.recoveryCodesRemaining }
        : {}),
    });
  });
}

/**
 * POST /api/auth/mfa/setup and /api/auth/mfa/enable for the signed-in user.
 * Mount after authentication and CSRF checks, before the enrollment gate.
 */
export function mountMfaEnrollment(
  app: Express,
  db: Database,
  config: AppConfig,
  limiter: RequestHandler,
) {
  app.post("/api/auth/mfa/setup", async (req: AuthRequest, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    const key = config.mfaKey;
    if (!key) throw unavailable();
    const user = req.user!;
    if (user.mfaEnabled)
      throw new ApiError(
        409,
        "MFA_ALREADY_ENABLED",
        "Two-factor sign-in is already set up for this account.",
      );
    const { rows } = await db.query<{ email: string; phone: string }>(
      `SELECT email,phone FROM users WHERE id=$1`,
      [user.id],
    );
    const secret = generateTotpSecret();
    await db.query(`UPDATE users SET mfa_pending_secret=$2 WHERE id=$1`, [
      user.id,
      encryptSecret(key, user.id, secret),
    ]);
    await audit(db, user, "auth.mfa_setup_started", "users", user.id);
    res.json({
      secret: secret.match(/.{1,4}/g)!.join(" "),
      otpauthUri: otpauthUri(
        secret,
        rows[0]?.email || rows[0]?.phone || user.name,
        "Agribridge",
      ),
    });
  });

  app.post("/api/auth/mfa/enable", limiter, async (req: AuthRequest, res) => {
    const { code } = z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/),
      })
      .strict()
      .parse(req.body);
    const key = config.mfaKey;
    if (!key) throw unavailable();
    const user = req.user!;
    const recoveryCodes = generateRecoveryCodes();
    const enabled = await db.transaction(async (tx) => {
      const { rows } = await tx.query<any>(
        `SELECT mfa_pending_secret,mfa_enabled_at FROM users WHERE id=$1 FOR UPDATE`,
        [user.id],
      );
      if (rows[0]?.mfa_enabled_at)
        throw new ApiError(
          409,
          "MFA_ALREADY_ENABLED",
          "Two-factor sign-in is already set up for this account.",
        );
      if (!rows[0]?.mfa_pending_secret)
        throw new ApiError(
          409,
          "MFA_SETUP_REQUIRED",
          "Start two-factor setup again to get a new key.",
        );
      const step = verifyTotp(
        decryptSecret(key, user.id, rows[0].mfa_pending_secret),
        code,
        null,
      );
      if (step === null) return false;
      await tx.query(
        `UPDATE users SET mfa_secret=mfa_pending_secret,mfa_pending_secret=NULL,mfa_enabled_at=now(),mfa_last_step=$2 WHERE id=$1`,
        [user.id, step],
      );
      await tx.query(`DELETE FROM mfa_recovery_codes WHERE user_id=$1`, [
        user.id,
      ]);
      for (const recoveryCode of recoveryCodes)
        await tx.query(
          `INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES($1,$2)`,
          [user.id, recoveryCodeHash(user.id, recoveryCode)],
        );
      // Sessions opened before two-factor sign-in no longer count.
      await tx.query(`DELETE FROM sessions WHERE user_id=$1`, [user.id]);
      await audit(tx, user, "auth.mfa_enabled", "users", user.id);
      return true;
    });
    if (!enabled)
      throw new ApiError(
        400,
        "INVALID_MFA_CODE",
        "That code is not valid. Check that your phone's time is set automatically, then enter the newest code.",
      );
    res.json({
      ...(await createSession(db, config, res, user.id)),
      recoveryCodes,
    });
  });
}

/** Paths an administrator may use before two-factor sign-in is set up. */
export const MFA_ENROLLMENT_PATHS = new Set([
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/password",
  "/api/auth/mfa/setup",
  "/api/auth/mfa/enable",
]);

export const enrollmentRequired = (user: User | undefined) =>
  user?.mfaEnrollmentRequired === true;
