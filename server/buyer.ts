import { Router, type Express } from "express";
import { randomUUID } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { Database } from "./db.js";
import { ApiError, hashPassword, verifyPassword } from "./security.js";
import {
  authenticateBuyer,
  buyerCsrfGuard,
  buyerOriginGuard,
  buyerPhoneSchema,
  clearBuyerCookie,
  createBuyerSession,
  mutateBuyer,
  presentBuyer,
  setBuyerCookie,
  type BuyerAccountRow,
  type BuyerRequest,
} from "./buyer-auth.js";
import { listBuyerCatalog } from "./buyer-catalog.js";
import {
  cancelBuyerOrder,
  createBuyerOrder,
  listBuyerOrders,
} from "./buyer-orders.js";

const signupSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    businessName: z.string().trim().max(160).default(""),
    phone: buyerPhoneSchema,
    email: z
      .union([z.literal(""), z.string().trim().email().max(254)])
      .transform((value) => value.toLowerCase())
      .default(""),
    district: z.string().trim().min(2).max(100),
    community: z.string().trim().max(140).default(""),
    password: z.string().min(14).max(256),
  })
  .strict();
const loginSchema = z
  .object({ phone: buyerPhoneSchema, password: z.string().min(1).max(256) })
  .strict();

/** Mount before ordinary application authentication; this router owns every /api/buyer response. */
export function mountBuyerMarketplace(
  app: Express,
  db: Database,
  config: AppConfig,
) {
  const router = Router();
  const dummyPassword = hashPassword(
    "Buyer login timing-only dummy comparison",
  );
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.use(buyerOriginGuard(config));
  const authLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "BUYER_AUTH_LIMIT",
        message: "Too many buyer sign-in attempts. Please try later.",
      },
    },
  });
  const signupLimit = rateLimit({
    windowMs: 60 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "BUYER_SIGNUP_LIMIT",
        message: "Too many account requests. Please try later.",
      },
    },
  });
  router.get("/catalog", async (req, res) => {
    res.json(
      await listBuyerCatalog(db, req.query, { includeSample: config.demo }),
    );
  });
  router.post("/signup", signupLimit, async (req, res) => {
    const input = signupSchema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    try {
      const result = await db.transaction(async (tx) => {
        const row = (
          await tx.query<BuyerAccountRow>(
            `INSERT INTO buyer_accounts(id,name,business_name,phone,email,district,community,password_hash)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
              randomUUID(),
              input.name,
              input.businessName,
              input.phone,
              input.email,
              input.district,
              input.community,
              passwordHash,
            ],
          )
        ).rows[0];
        return createBuyerSession(tx, presentBuyer(row), config);
      });
      setBuyerCookie(res, config, result.token);
      res.status(201).json(result.session);
    } catch (error: any) {
      if (error.code === "23505")
        throw new ApiError(
          409,
          "BUYER_ACCOUNT_EXISTS",
          "A buyer account already uses this number. Sign in or contact Agribridge for help.",
        );
      throw error;
    }
  });
  router.post("/login", authLimit, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const found = (
      await db.query<BuyerAccountRow>(
        "SELECT * FROM buyer_accounts WHERE phone=$1",
        [input.phone],
      )
    ).rows[0];
    const valid = await verifyPassword(
      input.password,
      found?.password_hash || (await dummyPassword),
    );
    if (!found?.active || !valid)
      throw new ApiError(
        401,
        "BUYER_INVALID_CREDENTIALS",
        "Phone number or password is incorrect.",
      );
    const result = await db.transaction(async (tx) => {
      const current = (
        await tx.query<BuyerAccountRow>(
          "SELECT * FROM buyer_accounts WHERE id=$1 AND active=true AND password_hash=$2 FOR UPDATE",
          [found.id, found.password_hash],
        )
      ).rows[0];
      if (!current)
        throw new ApiError(
          401,
          "BUYER_INVALID_CREDENTIALS",
          "Phone number or password is incorrect.",
        );
      return createBuyerSession(tx, presentBuyer(current), config);
    });
    setBuyerCookie(res, config, result.token);
    res.json(result.session);
  });
  router.use(authenticateBuyer(db, config));
  router.get("/session", (req: BuyerRequest, res) => {
    res.json({ buyer: req.buyer, csrfToken: req.buyerCsrfToken });
  });
  router.get("/orders", async (req: BuyerRequest, res) => {
    res.json(await listBuyerOrders(db, req.buyer!.id, req.query));
  });
  router.use(buyerCsrfGuard);
  router.post("/logout", async (req: BuyerRequest, res) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    await db.query("DELETE FROM buyer_sessions WHERE token_hash=$1", [
      req.buyerSessionHash,
    ]);
    clearBuyerCookie(res, config);
    res.json({ signedOut: true });
  });
  router.post("/orders", async (req: BuyerRequest, res) => {
    const result = await mutateBuyer(db, req, async (tx) => ({
      status: 201,
      body: await createBuyerOrder(tx, req.buyer!, req.body, {
        includeSample: config.demo,
      }),
    }));
    res.status(result.status).json(result.body);
  });
  router.patch("/orders/:id", async (req: BuyerRequest, res) => {
    const id = z.string().min(1).max(160).parse(req.params.id);
    const result = await mutateBuyer(db, req, async (tx) => ({
      status: 200,
      body: await cancelBuyerOrder(tx, req.buyer!, id, req.body),
    }));
    res.status(result.status).json(result.body);
  });
  router.use((_req, res) => {
    res
      .status(404)
      .json({
        error: {
          code: "BUYER_ROUTE_NOT_FOUND",
          message: "Buyer endpoint not found.",
        },
      });
  });
  app.use("/api/buyer", router);
}
