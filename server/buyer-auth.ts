import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Database, Queryable } from "./db.js";
import { ApiError, safeEqual, sha256 } from "./security.js";
import type { BuyerAccount, BuyerSession } from "./buyer-types.js";

export interface BuyerRequest extends Request {
  buyer?: BuyerAccount;
  buyerCsrfToken?: string;
  buyerSessionHash?: string;
}
export type BuyerAccountRow = {
  id: string;
  name: string;
  business_name: string;
  phone: string;
  email: string;
  district: string;
  community: string;
  phone_verified: boolean;
  active: boolean;
  password_hash: string;
  created_at: Date | string;
};

export const buyerPhoneSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value) =>
    value.replace(/[\s()-]/g, "").replace(/^0(?=[37]\d{8}$)/, "+256"),
  )
  .pipe(
    z
      .string()
      .regex(
        /^\+256[37]\d{8}$/,
        "Use a Uganda mobile number, such as +256 followed by the mobile number.",
      ),
  );
export const buyerCookieName = (config: AppConfig) =>
  config.production ? "__Host-agribridge_buyer" : "agribridge_buyer";
export function presentBuyer(row: BuyerAccountRow): BuyerAccount {
  return {
    id: row.id,
    name: row.name,
    businessName: row.business_name,
    phone: row.phone,
    email: row.email,
    district: row.district,
    community: row.community,
    phoneVerified: Boolean(row.phone_verified),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Set cookies only after the transaction that creates their session has committed. */
export function setBuyerCookie(
  res: Response,
  config: AppConfig,
  token: string,
) {
  res.cookie(buyerCookieName(config), token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionHours * 3_600_000,
  });
}
export function clearBuyerCookie(res: Response, config: AppConfig) {
  res.clearCookie(buyerCookieName(config), {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
  });
}
export async function createBuyerSession(
  tx: Queryable,
  buyer: BuyerAccount,
  config: AppConfig,
): Promise<{ token: string; session: BuyerSession }> {
  const token = randomBytes(32).toString("hex"),
    csrfToken = randomBytes(32).toString("hex");
  await tx.query(
    "INSERT INTO buyer_sessions(token_hash,buyer_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)",
    [
      sha256(token),
      buyer.id,
      csrfToken,
      new Date(Date.now() + config.sessionHours * 3_600_000).toISOString(),
    ],
  );
  return { token, session: { buyer, csrfToken } };
}

/** This cookie is never accepted by the farmer/staff authentication middleware. */
export function authenticateBuyer(db: Database, config: AppConfig) {
  return async (req: BuyerRequest, _res: Response, next: NextFunction) => {
    try {
      const name = buyerCookieName(config);
      const cookie = (req.headers.cookie || "")
        .split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${name}=`));
      const token = cookie?.slice(name.length + 1);
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        throw new ApiError(
          401,
          "BUYER_UNAUTHENTICATED",
          "Sign in to your buyer account.",
        );
      const tokenHash = sha256(token);
      const row = (
        await db.query<BuyerAccountRow & { csrf_token: string }>(
          `SELECT a.*,s.csrf_token FROM buyer_sessions s JOIN buyer_accounts a ON a.id=s.buyer_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active=true`,
          [tokenHash],
        )
      ).rows[0];
      if (!row)
        throw new ApiError(
          401,
          "BUYER_UNAUTHENTICATED",
          "Your buyer session expired. Sign in again.",
        );
      req.buyer = presentBuyer(row);
      req.buyerCsrfToken = row.csrf_token;
      req.buyerSessionHash = tokenHash;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Buyer credentials are used only on the configured same-origin web surface. */
export function buyerOriginGuard(config: AppConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (
      req.get("origin") !== config.publicOrigin ||
      req.get("sec-fetch-site") === "cross-site"
    )
      return next(
        new ApiError(
          403,
          "BUYER_ORIGIN_DENIED",
          "Use the configured Agribridge website to change your buyer account or orders.",
        ),
      );
    next();
  };
}
export function buyerCsrfGuard(
  req: BuyerRequest,
  _res: Response,
  next: NextFunction,
) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (
    !req.buyerCsrfToken ||
    !safeEqual(req.buyerCsrfToken, req.get("x-buyer-csrf-token") || "")
  )
    return next(
      new ApiError(
        403,
        "BUYER_CSRF_INVALID",
        "Refresh your buyer session before trying again.",
      ),
    );
  next();
}

/** Durable request keys belong to the isolated buyer identity, never an organization member. */
export async function mutateBuyer(
  db: Database,
  req: BuyerRequest,
  operation: (tx: Queryable) => Promise<{ status: number; body: unknown }>,
) {
  const buyer = req.buyer!,
    key = req.get("idempotency-key");
  if (
    !key ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  )
    throw new ApiError(
      400,
      "BUYER_IDEMPOTENCY_REQUIRED",
      "Use a UUID request key when changing an order.",
    );
  const fingerprint = sha256(
    `${req.method}:${req.originalUrl}:${JSON.stringify(req.body)}`,
  );
  async function replay(tx: Queryable) {
    const saved = (
      await tx.query<{
        request_hash: string;
        response: unknown;
        status: number;
      }>(
        "SELECT request_hash,response,status FROM buyer_idempotency WHERE buyer_id=$1 AND key=$2",
        [buyer.id, key],
      )
    ).rows[0];
    if (!saved) return;
    if (saved.request_hash !== fingerprint)
      throw new ApiError(
        409,
        "BUYER_IDEMPOTENCY_CONFLICT",
        "This request key was already used for a different order action.",
      );
    return { status: saved.status, body: saved.response };
  }
  try {
    return await db.transaction(async (tx) => {
      // The account lock serializes first-use keys, including two different tabs.
      const account = (
        await tx.query(
          "SELECT id FROM buyer_accounts WHERE id=$1 AND active=true FOR UPDATE",
          [buyer.id],
        )
      ).rows[0];
      if (!account)
        throw new ApiError(
          401,
          "BUYER_UNAUTHENTICATED",
          "This buyer account is unavailable.",
        );
      const saved = await replay(tx);
      if (saved) return saved;
      const result = await operation(tx);
      await tx.query(
        "INSERT INTO buyer_idempotency(buyer_id,key,request_hash,response,status) VALUES($1,$2,$3,$4::jsonb,$5)",
        [
          buyer.id,
          key,
          fingerprint,
          JSON.stringify(result.body),
          result.status,
        ],
      );
      return result;
    });
  } catch (error) {
    const saved = await replay(db);
    if (saved) return saved;
    throw error;
  }
}
