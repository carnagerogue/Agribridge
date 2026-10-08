import { randomInt, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { getChannelReadiness, sendOutbound } from "./channels/index.js";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";
import { reserveMessageBudget } from "./messaging-budget.js";
import { startMfaChallenge } from "./mfa-routes.js";
import { errorFields, type Logger } from "./observability.js";
import { DatabaseRateLimitStore } from "./rate-limit.js";
import {
  ApiError,
  createSession,
  hashPassword,
  safeEqual,
  sha256,
  type User,
} from "./security.js";
import { audit } from "./store.js";

const CODE_MINUTES = 10;
const CODE_ATTEMPTS = 5;
const phone = z
  .string()
  .trim()
  .regex(/^\+256[37]\d{8}$/, "Use a Uganda number such as +2567XXXXXXXX.");
const codeHash = (resetId: string, code: string) =>
  sha256(`agribridge-password-reset:${resetId}:${code}`);

const unavailable = () =>
  new ApiError(
    503,
    "RECOVERY_UNAVAILABLE",
    "Password reset by SMS is not available on this service. Ask your cooperative's administrator to set a temporary password.",
  );
const invalidCode = () =>
  new ApiError(
    401,
    "INVALID_RESET_CODE",
    "That code is not valid or has expired. Request a new code.",
  );

/**
 * Password reset by SMS code, for accounts with a Uganda mobile number:
 * POST /api/auth/recovery/request {phone} and
 * POST /api/auth/recovery/confirm {phone, code, newPassword}.
 * Mount before authentication.
 */
export function mountPasswordRecovery(
  app: Express,
  db: Database,
  config: AppConfig,
  env: NodeJS.ProcessEnv,
  dependencies: {
    limiter: RequestHandler;
    logger: Logger;
    smsFetch?: typeof fetch;
  },
) {
  const available = () =>
    !config.demo &&
    getChannelReadiness(env).find((channel) => channel.id === "sms")?.status ===
      "configured";
  // Each number receives at most three codes an hour, across all servers.
  const perNumber = rateLimit({
    windowMs: 60 * 60_000,
    limit: 3,
    store: new DatabaseRateLimitStore(db, "recovery-number"),
    keyGenerator: (req) =>
      typeof req.body?.phone === "string" ? req.body.phone.trim() : "missing",
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message:
          "Too many codes were requested for this number. Wait an hour, or ask your administrator.",
      },
    },
  });

  async function sendCode(userId: string, tenantId: string, to: string) {
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    const resetId = randomUUID();
    await db.transaction(async (tx) => {
      // Only the newest code works.
      await tx.query(
        `DELETE FROM password_resets WHERE user_id=$1 AND used_at IS NULL`,
        [userId],
      );
      await tx.query(
        `INSERT INTO password_resets(id,user_id,code_hash,expires_at) VALUES($1,$2,$3,now()+make_interval(mins=>$4))`,
        [resetId, userId, codeHash(resetId, code), CODE_MINUTES],
      );
    });
    if (!(await reserveMessageBudget(db, tenantId, to, env))) {
      dependencies.logger.warn("recovery.sms_budget_exhausted");
      return;
    }
    const result = await sendOutbound(
      {
        channel: "sms",
        to,
        // Never stored: the code exists only in this message and as a hash.
        body: `Agribridge password reset code: ${code}. It expires in ${CODE_MINUTES} minutes. Never share it. Agribridge staff will never ask for it.`,
        idempotencyKey: `reset:${resetId}`,
        // The account holder asked for this security message; it is not marketing.
        consent: true,
      },
      { env, fetchImpl: dependencies.smsFetch },
    );
    if (result.status === "failed" || result.status === "not_configured")
      dependencies.logger.warn("recovery.sms_not_sent", {
        reason: result.error,
      });
  }

  app.post(
    "/api/auth/recovery/request",
    dependencies.limiter,
    perNumber,
    async (req, res) => {
      const input = z.object({ phone }).strict().parse(req.body);
      if (!available()) throw unavailable();
      const { rows } = await db.query<{
        id: string;
        name: string;
        role: User["role"];
        tenant_id: string;
      }>(
        `SELECT id,name,role,tenant_id FROM users WHERE phone=$1 AND active=true AND password_hash IS NOT NULL`,
        [input.phone],
      );
      // Same response, sent before any provider call, whether or not an
      // account uses the number: the form cannot reveal who has an account.
      res.status(202).json({
        message:
          "If an account uses this number, a 6-digit code is on its way. It can take a few minutes and expires in 10 minutes.",
      });
      const account = rows[0];
      if (!account) return;
      sendCode(account.id, account.tenant_id, input.phone)
        .then(() =>
          audit(
            db,
            {
              id: account.id,
              name: account.name,
              role: account.role,
              organizationId: account.tenant_id,
              organizationName: "",
            },
            "auth.password_reset_requested",
            "users",
            account.id,
          ),
        )
        .catch((error) =>
          dependencies.logger.error(
            "recovery.request_failed",
            errorFields(error),
          ),
        );
    },
  );

  app.post(
    "/api/auth/recovery/confirm",
    dependencies.limiter,
    async (req, res) => {
      const input = z
        .object({
          phone,
          code: z
            .string()
            .trim()
            .regex(/^\d{6}$/, "Enter the 6-digit code."),
          newPassword: z.string().min(14).max(256),
        })
        .strict()
        .parse(req.body);
      if (!available()) throw unavailable();
      const passwordHash = await hashPassword(input.newPassword);
      // Count the attempt even when the code is wrong: never throw inside here.
      const outcome = await db.transaction(async (tx) => {
        const { rows } = await tx.query<any>(
          `SELECT r.id,r.attempts,r.code_hash,u.id AS user_id,u.name,u.role,u.tenant_id,u.mfa_enabled_at FROM password_resets r JOIN users u ON u.id=r.user_id WHERE u.phone=$1 AND u.active=true AND r.used_at IS NULL AND r.expires_at>now() ORDER BY r.created_at DESC LIMIT 1 FOR UPDATE OF r`,
          [input.phone],
        );
        const reset = rows[0];
        if (!reset) return { status: "invalid" as const };
        if (!safeEqual(reset.code_hash, codeHash(reset.id, input.code))) {
          if (reset.attempts + 1 >= CODE_ATTEMPTS)
            await tx.query(`DELETE FROM password_resets WHERE id=$1`, [
              reset.id,
            ]);
          else
            await tx.query(
              `UPDATE password_resets SET attempts=attempts+1 WHERE id=$1`,
              [reset.id],
            );
          return { status: "invalid" as const };
        }
        await tx.query(`UPDATE password_resets SET used_at=now() WHERE id=$1`, [
          reset.id,
        ]);
        await tx.query(
          `UPDATE users SET password_hash=$2,password_change_required=false WHERE id=$1`,
          [reset.user_id, passwordHash],
        );
        // A reset ends every existing session, wherever it was opened.
        await tx.query(`DELETE FROM sessions WHERE user_id=$1`, [
          reset.user_id,
        ]);
        await tx.query(`DELETE FROM mfa_challenges WHERE user_id=$1`, [
          reset.user_id,
        ]);
        await audit(
          tx,
          {
            id: reset.user_id,
            name: reset.name,
            role: reset.role,
            organizationId: reset.tenant_id,
            organizationName: "",
          },
          "auth.password_reset",
          "users",
          reset.user_id,
        );
        return {
          status: "reset" as const,
          userId: reset.user_id as string,
          mfa: reset.mfa_enabled_at !== null,
        };
      });
      if (outcome.status === "invalid") throw invalidCode();
      if (outcome.mfa) {
        // A new password never replaces the second factor.
        if (!config.mfaKey) throw unavailable();
        res.json({
          mfaRequired: true,
          challenge: await startMfaChallenge(db, outcome.userId),
        });
        return;
      }
      res.json(await createSession(db, config, res, outcome.userId));
    },
  );
}
