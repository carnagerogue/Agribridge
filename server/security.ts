import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import type { Database } from "./db.js";
import type { AppConfig } from "./config.js";

const scrypt = promisify(scryptCallback);
export type User = {
  id: string;
  name: string;
  role: "farmer" | "operator" | "admin";
  organizationId: string;
  organizationName: string;
  passwordChangeRequired?: boolean;
};
export interface AuthRequest extends Request {
  user?: User;
  csrfToken?: string;
  sessionHash?: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, salt, hex] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hex || hex.length !== 128)
    return false;
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  const actual = Buffer.from(hex, "hex");
  return actual.length === hash.length && timingSafeEqual(hash, actual);
}
export function safeEqual(a: string, b: string) {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}
export function requireOperator(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  if (req.user?.role === "farmer")
    return next(
      new ApiError(403, "FORBIDDEN", "An operator role is required."),
    );
  next();
}
export function originGuard(config: AppConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    if (
      (origin && origin !== config.publicOrigin) ||
      req.get("sec-fetch-site") === "cross-site"
    )
      return next(
        new ApiError(403, "ORIGIN_DENIED", "Request origin is not allowed."),
      );
    next();
  };
}
export function csrfGuard(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (
    !req.csrfToken ||
    !safeEqual(req.csrfToken, req.get("x-csrf-token") || "")
  )
    return next(
      new ApiError(
        403,
        "CSRF_INVALID",
        "Refresh your session before trying again.",
      ),
    );
  next();
}
export function authenticate(db: Database, config: AppConfig) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      const cookie = (req.headers.cookie || "")
        .split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${config.cookieName}=`));
      const token = cookie?.slice(config.cookieName.length + 1);
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
      const tokenHash = sha256(token);
      const { rows } = await db.query<any>(
        `SELECT u.id,u.name,u.role,u.tenant_id,u.password_change_required,o.name AS organization_name,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id JOIN organizations o ON o.id=u.tenant_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,
        [tokenHash],
      );
      const user = rows[0];
      if (!user)
        throw new ApiError(
          401,
          "UNAUTHENTICATED",
          "Your session has expired. Please sign in.",
        );
      req.user = {
        id: user.id,
        name: user.name,
        role: user.role,
        organizationId: user.tenant_id,
        organizationName: user.organization_name,
        passwordChangeRequired: user.password_change_required,
      };
      req.csrfToken = user.csrf_token;
      req.sessionHash = tokenHash;
      next();
    } catch (error) {
      next(error);
    }
  };
}
export async function createSession(
  db: Database,
  config: AppConfig,
  res: Response,
  userId: string,
) {
  const token = randomBytes(32).toString("hex");
  const csrfToken = randomBytes(32).toString("hex");
  await db.query(
    `INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)`,
    [
      sha256(token),
      userId,
      csrfToken,
      new Date(Date.now() + config.sessionHours * 3600_000),
    ],
  );
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionHours * 3600_000,
  });
  const { rows } = await db.query<any>(
    `SELECT u.id,u.name,u.role,u.tenant_id,u.password_change_required,o.name AS organization_name FROM users u JOIN organizations o ON o.id=u.tenant_id WHERE u.id=$1`,
    [userId],
  );
  const user = rows[0];
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      organizationId: user.tenant_id,
      organizationName: user.organization_name,
      passwordChangeRequired: user.password_change_required,
    } as User,
    csrfToken,
  };
}
