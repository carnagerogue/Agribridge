import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Database } from "./db.js";
import type { AppConfig } from "./config.js";
import {
  ApiError,
  authenticate,
  createSession,
  csrfGuard,
  originGuard,
  requireOperator,
  verifyPassword,
  hashPassword,
  type AuthRequest,
} from "./security.js";
import {
  schemas,
  settingsSchema,
  defaultSettings,
  type EntityType,
} from "./schemas.js";
import { DEMO_USERS } from "./seed.js";
import {
  editLesson,
  getLesson,
  getLessons,
  publicLessons,
} from "./lesson-editorial.js";
import {
  audit,
  findEntity,
  insertEntity,
  listEntities,
  mutate,
  operatorTypes,
  present,
} from "./store.js";
import { countRecords, selectRecords, updateRecord } from "./records.js";
import {
  createWeatherService,
  createWarningsService,
  weatherSetupProblem,
} from "./weather.js";
import {
  createChannelRouter,
  sendOutbound,
  getChannelReadiness,
} from "./channels/index.js";
import { createChannelBridge } from "./channel-bridge.js";
import { DatabaseRateLimitStore } from "./rate-limit.js";
import {
  errorFields,
  logPath,
  requestId,
  requestLogging,
  silentLogger,
  type Logger,
} from "./observability.js";
import {
  answerQuestion,
  AssistantError,
  getAssistantLimits,
  getAssistantStatus,
} from "./ai/index.js";
import { assistantBudget } from "./ai-budget.js";
import { reserveMessageBudget } from "./messaging-budget.js";
import { mountWhatsApp } from "./whatsapp.js";
import { createMarketDataService, mountMarketData } from "./market-data.js";
import {
  prepareWorkflow,
  allocateCollection,
  decorateWorkflow,
} from "./workflows.js";

export function createApp(
  db: Database,
  config: AppConfig,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: {
    whatsappFetch?: typeof fetch;
    marketFetch?: typeof fetch;
    logger?: Logger;
  } = {},
) {
  const app = express();
  const logger = dependencies.logger ?? silentLogger;
  const marketData = createMarketDataService(db, {
    fetchImpl: dependencies.marketFetch,
  });
  app.disable("x-powered-by");
  if (env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(requestLogging(logger, env.TRUST_PROXY === "1"));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          workerSrc: ["'self'"],
        },
      },
    }),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api/channels",
    createChannelRouter({ handlers: createChannelBridge(db, env), env }),
  );
  app.use(express.json({ limit: "32kb" }));
  // Health checks come before rate limiting, whose counters live in the
  // database: liveness must not depend on it, and readiness reports it.
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      mode: config.demo
        ? "demo"
        : config.production
          ? "production"
          : "development",
    }),
  );
  // Readiness for load balancers: the process is up and the database answers.
  app.get("/api/health/ready", async (_req, res) => {
    try {
      await Promise.race([
        db.query("SELECT 1"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database timeout")), 2000).unref(),
        ),
      ]);
      res.json({ status: "ready" });
    } catch (error) {
      logger.error("health.database_unavailable", errorFields(error));
      res
        .status(503)
        .json({ status: "unavailable", checks: { database: "unavailable" } });
    }
  });
  app.use("/api", originGuard(config));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      store: new DatabaseRateLimitStore(db, "api"),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait a minute.",
        },
      },
    }),
  );
  app.get("/api/lessons", (req: AuthRequest, res, next) => {
    if (
      !(req.headers.cookie || "")
        .split(";")
        .some((value) => value.trim().startsWith(`${config.cookieName}=`))
    ) {
      res.json(publicLessons());
      return;
    }
    void authenticate(db, config)(req, res, async (error) => {
      if (error) return next(error);
      if (req.user?.passwordChangeRequired)
        return next(
          new ApiError(
            403,
            "PASSWORD_CHANGE_REQUIRED",
            "Change your initial password before accessing your account.",
          ),
        );
      try {
        res.json(await getLessons(db, req.user!.organizationId));
      } catch (failure) {
        next(failure);
      }
    });
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    store: new DatabaseRateLimitStore(db, "auth"),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Please wait.",
      },
    },
  });
  const dummyPassword = hashPassword("No-user-password-comparison-only");
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const input = z
      .object({
        email: z.string().trim().min(3).max(254),
        password: z.string().min(1).max(256),
      })
      .strict()
      .parse(req.body);
    const { rows } = await db.query<any>(
      `SELECT id,password_hash FROM users WHERE (lower(email)=$1 OR phone=$1) AND active=true`,
      [input.email.toLowerCase()],
    );
    const found = rows[0];
    const valid = await verifyPassword(
      input.password,
      found?.password_hash || (await dummyPassword),
    );
    if (!found?.password_hash || !valid)
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
    const result = await createSession(db, config, res, found.id);
    await audit(db, result.user, "auth.login", "sessions");
    res.json(result);
  });
  app.post("/api/auth/demo", authLimiter, async (req, res) => {
    if (!config.demo) throw new ApiError(404, "NOT_FOUND", "Not found.");
    const { role } = z
      .object({ role: z.enum(["farmer", "operator", "admin"]) })
      .strict()
      .parse(req.body);
    const result = await createSession(db, config, res, DEMO_USERS[role]);
    await audit(db, result.user, "auth.demo", "sessions");
    res.json(result);
  });
  app.use("/api", authenticate(db, config));
  app.get("/api/auth/session", (req: AuthRequest, res) =>
    res.json({ user: req.user, csrfToken: req.csrfToken }),
  );
  app.use("/api", csrfGuard);
  app.post("/api/auth/logout", async (req: AuthRequest, res) => {
    await db.query(`DELETE FROM sessions WHERE token_hash=$1`, [
      req.sessionHash,
    ]);
    await audit(db, req.user!, "auth.logout", "sessions");
    res.clearCookie(config.cookieName, {
      httpOnly: true,
      secure: config.production,
      sameSite: "lax",
      path: "/",
    });
    res.json({ ok: true });
  });
  app.post("/api/auth/password", authLimiter, async (req: AuthRequest, res) => {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z.string().min(14).max(256),
      })
      .strict()
      .parse(req.body);
    const user = req.user!;
    const { rows } = await db.query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id=$1 AND tenant_id=$2`,
      [user.id, user.organizationId],
    );
    if (
      !rows[0]?.password_hash ||
      !(await verifyPassword(input.currentPassword, rows[0].password_hash))
    )
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Your current password is incorrect.",
      );
    if (input.currentPassword === input.newPassword)
      throw new ApiError(
        400,
        "PASSWORD_UNCHANGED",
        "Choose a different password.",
      );
    const hash = await hashPassword(input.newPassword);
    await db.transaction(async (tx) => {
      await tx.query(
        `UPDATE users SET password_hash=$2,password_change_required=false WHERE id=$1`,
        [user.id, hash],
      );
      await tx.query(`DELETE FROM sessions WHERE user_id=$1`, [user.id]);
      await audit(tx, user, "auth.password_changed", "users", user.id);
    });
    res.json(await createSession(db, config, res, user.id));
  });
  app.use("/api", (req: AuthRequest, _res, next) => {
    if (req.user?.passwordChangeRequired)
      return next(
        new ApiError(
          403,
          "PASSWORD_CHANGE_REQUIRED",
          "Change your initial password before accessing your account.",
        ),
      );
    next();
  });
  app.get("/api/bootstrap", async (req: AuthRequest, res) => {
    const user = req.user!;
    const types = [
      "farms",
      "tasks",
      "contacts",
      "market-prices",
      "offers",
      "deals",
      "reports",
      "progress",
      "messages",
      "settings",
      "seasons",
      "lots",
      "collections",
    ];
    const items = await Promise.all(
      types.map(async (type) =>
        decorateWorkflow(db, user, type, await listEntities(db, user, type)),
      ),
    );
    const data = Object.fromEntries(
      types.map((type, index) => [type, items[index]]),
    );
    const lessons = await getLessons(db, user.organizationId);
    const progress = data.progress.map((item: any) => {
      const current = lessons.find((lesson) => lesson.id === item.lessonId);
      return current && (item.lessonVersion || 1) !== current.version
        ? { ...item, completed: false, needsReview: true }
        : item;
    });
    res.json({
      farms: data.farms,
      tasks: data.tasks,
      contacts: data.contacts,
      marketPrices: data["market-prices"],
      offers: data.offers,
      deals: data.deals,
      reports: data.reports,
      seasons: data.seasons,
      lots: data.lots,
      collections: data.collections,
      lessons,
      progress,
      messages: data.messages,
      settings: data.settings[0] || defaultSettings,
      permissions: {
        manageContacts: user.role !== "farmer",
        manageTrade: user.role !== "farmer",
        triageReports: user.role !== "farmer",
        admin: user.role === "admin",
      },
      sample: config.demo,
    });
  });
  mountWhatsApp(app, db, config, env, dependencies.whatsappFetch);
  mountMarketData(app, marketData);
  for (const [type, schema] of Object.entries(schemas) as [
    EntityType,
    (typeof schemas)[EntityType],
  ][]) {
    const guard = operatorTypes.has(type) ? [requireOperator] : [];
    app.get(`/api/${type}`, ...guard, async (req: AuthRequest, res) =>
      res.json(
        await decorateWorkflow(
          db,
          req.user!,
          type,
          await listEntities(db, req.user!, type),
        ),
      ),
    );
    app.post(`/api/${type}`, ...guard, async (req: AuthRequest, res) => {
      const result = await mutate(db, req, async (tx) => {
        let input: any = schema.parse(req.body);
        const user = req.user!;
        if (
          type === "reports" &&
          user.role === "farmer" &&
          input.status !== "submitted"
        )
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Only an operator can review a report.",
          );
        let ownerId = user.id;
        if (input.farmId) {
          const farm = await findEntity(tx, user, "farms", input.farmId);
          if (["tasks", "seasons", "lots"].includes(type))
            ownerId = farm.owner_id;
        }
        if (type === "offers" && user.role === "farmer")
          input.sellerName = user.name;
        if (type === "farms" && user.role === "farmer")
          input.ownerName = user.name;
        if (type === "contacts") {
          input.consentChannels = input.consent ? [input.preferredChannel] : [];
          input.consentRecordedAt = input.consent
            ? new Date().toISOString()
            : null;
          input.consentSource = input.consent ? "operator_attestation" : null;
        }
        input = await prepareWorkflow(tx, user, type, input);
        const entity: any = await insertEntity(tx, user, type, input, ownerId);
        if (type === "collections")
          Object.assign(
            entity,
            await allocateCollection(tx, user, entity.id, input),
          );
        await audit(tx, user, "record.created", type, entity.id);
        return {
          status: 201,
          body: (await decorateWorkflow(tx, user, type, [entity]))[0],
        };
      });
      res.status(result.status).json(result.body);
    });
    app.patch(`/api/${type}/:id`, ...guard, async (req: AuthRequest, res) => {
      const result = await mutate(db, req, async (tx) => {
        const parsed = schema
          .partial()
          .extend({ version: z.number().int().positive() })
          .strict()
          .parse(req.body) as any;
        const version = parsed.version;
        // Zod applies nested defaults even inside partial schemas. A PATCH must
        // update only fields actually supplied, never reset omitted values.
        let input = Object.fromEntries(
          Object.entries(parsed).filter(
            ([key]) => key !== "version" && Object.hasOwn(req.body, key),
          ),
        ) as any;
        if (!Object.keys(input).length)
          throw new ApiError(400, "EMPTY_UPDATE", "No changes were provided.");
        const user = req.user!;
        const id = String(req.params.id);
        const old = await findEntity(tx, user, type, id, true);
        if (
          type === "reports" &&
          user.role === "farmer" &&
          input.status &&
          input.status !== "submitted"
        )
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Only an operator can review a report.",
          );
        if (
          type === "reports" &&
          user.role === "farmer" &&
          old.data.status !== "submitted"
        )
          throw new ApiError(
            403,
            "FORBIDDEN",
            "This report is under review; contact your operator for changes.",
          );
        if (input.farmId) {
          const farm = await findEntity(tx, user, "farms", input.farmId);
          if (type === "tasks" && farm.owner_id !== old.owner_id)
            throw new ApiError(
              409,
              "TASK_OWNER_CONFLICT",
              "Create a new task for that farmer so private notes are not transferred.",
            );
        }
        if (type === "offers" && user.role === "farmer" && input.sellerName)
          input.sellerName = user.name;
        if (type === "farms" && user.role === "farmer" && input.ownerName)
          input.ownerName = user.name;
        if (type === "contacts" && input.consent !== undefined) {
          input.consentChannels = input.consent
            ? [input.preferredChannel || old.data.preferredChannel]
            : [];
          input.consentRecordedAt = new Date().toISOString();
          input.consentSource = input.consent
            ? "operator_attestation"
            : "operator_withdrawal";
        }
        if (
          type === "contacts" &&
          input.phone !== undefined &&
          input.phone !== old.data.phone
        ) {
          if (input.consent === true)
            throw new ApiError(
              409,
              "CONSENT_RECONFIRM_REQUIRED",
              "Save the new number with messaging permission disabled, then record fresh permission for that number.",
            );
          input.lastInboundAt = {};
          input.consent = false;
          input.consentChannels = [];
          input.consentRecordedAt = new Date().toISOString();
          input.consentSource = "phone_changed";
        }
        input = await prepareWorkflow(tx, user, type, input, old);
        const updated = await updateRecord(
          tx,
          type,
          { id, tenantId: user.organizationId },
          input,
          { expectedVersion: version },
        );
        if (!updated)
          throw new ApiError(
            409,
            "VERSION_CONFLICT",
            "This record changed on another device. Refresh and review your changes.",
          );
        const entity: any = present(updated);
        if (type === "collections")
          Object.assign(entity, await allocateCollection(tx, user, id, input));
        await audit(tx, user, "record.updated", type, id);
        return {
          status: 200,
          body: (await decorateWorkflow(tx, user, type, [entity]))[0],
        };
      });
      res.status(result.status).json(result.body);
    });
  }
  app.put("/api/settings", async (req: AuthRequest, res) => {
    const result = await mutate(db, req, async (tx) => {
      const data = settingsSchema.parse(req.body);
      const user = req.user!;
      const [current] = await selectRecords(
        tx,
        "settings",
        "tenant_id=$1 AND owner_id=$2",
        [user.organizationId, user.id],
        "FOR UPDATE",
      );
      const body = current
        ? present(
            (await updateRecord(
              tx,
              "settings",
              { id: current.id, tenantId: user.organizationId },
              data,
            ))!,
          )
        : await insertEntity(tx, user, "settings", data);
      await audit(tx, user, "settings.updated", "settings");
      return { status: 200, body };
    });
    res.status(result.status).json(result.body);
  });
  app.put("/api/progress/:lessonId", async (req: AuthRequest, res) => {
    const result = await mutate(db, req, async (tx) => {
      const input = z
        .object({ answerIndex: z.number().int().min(0).max(20) })
        .strict()
        .parse(req.body);
      const lesson = await getLesson(
        tx,
        req.user!.organizationId,
        String(req.params.lessonId),
      );
      if (input.answerIndex >= lesson.quiz.options.length)
        throw new ApiError(
          400,
          "INVALID_ANSWER",
          "Select one of the available answers.",
        );
      const user = req.user!;
      const passed = input.answerIndex === lesson.quiz.answerIndex;
      const data = {
        lessonId: lesson.id,
        lessonVersion: lesson.version,
        completed: passed,
        score: passed ? 100 : 0,
      };
      const [current] = await selectRecords(
        tx,
        "progress",
        "tenant_id=$1 AND owner_id=$2 AND lesson_id=$3",
        [user.organizationId, user.id, lesson.id],
        "FOR UPDATE",
      );
      const body = current
        ? present(
            (await updateRecord(
              tx,
              "progress",
              { id: current.id, tenantId: user.organizationId },
              data,
            ))!,
          )
        : await insertEntity(tx, user, "progress", data);
      await audit(tx, user, "lesson.attempted", "progress", lesson.id);
      return {
        status: 200,
        body: { ...body, explanation: lesson.quiz.explanation },
      };
    });
    res.status(result.status).json(result.body);
  });
  const weather = createWeatherService(env, fetch, logger);
  const warnings = createWarningsService();
  app.get("/api/weather", async (req, res) => {
    const { latitude, longitude } = z
      .object({
        latitude: z.coerce.number().min(-1.6).max(4.3),
        longitude: z.coerce.number().min(29.4).max(35.1),
      })
      .parse(req.query);
    res.json(await weather(latitude, longitude));
  });
  app.get("/api/weather/warnings", async (_req, res) =>
    res.json(await warnings()),
  );
  app.get("/api/assistant/status", async (req: AuthRequest, res) => {
    const budget = assistantBudget(db, req.user!);
    res.json(
      getAssistantStatus(await budget.remaining(getAssistantLimits(env)), env),
    );
  });
  app.post("/api/assistant", async (req: AuthRequest, res) => {
    const budget = assistantBudget(db, req.user!);
    let weatherContext;
    const points: Record<string, [number, number]> = {
      Kampala: [0.3136, 32.5811],
      Wakiso: [0.4044, 32.4594],
      Nakaseke: [0.728, 32.385],
      Kiboga: [0.916, 31.774],
      Jinja: [0.4479, 33.2026],
      Mbale: [1.0821, 34.175],
      Gulu: [2.7724, 32.2881],
      Mbarara: [-0.6072, 30.6545],
    };
    const district =
      typeof req.body?.district === "string" ? req.body.district : undefined;
    const point = district ? points[district] : undefined;
    if (
      point &&
      req.body?.consent === true &&
      typeof req.body?.question === "string" &&
      /weather|rain|forecast|plant|season/i.test(req.body.question)
    ) {
      try {
        const forecast = await weather(...point);
        weatherContext = {
          district: district!,
          summary: forecast.days
            .slice(0, 3)
            .map(
              (day) =>
                `${day.date}: ${day.min}–${day.max}C, rain chance ${day.rainChance}%, rainfall ${day.rainMm}mm`,
            )
            .join("; "),
          sourceTitle: forecast.source,
          sourceUrl: "https://open-meteo.com/",
          fetchedAt: forecast.fetchedAt,
        };
      } catch {
        /* Missing weather never becomes a guessed forecast. */
      }
    }
    const lessons = await getLessons(db, req.user!.organizationId);
    const result = await answerQuestion(
      req.body,
      {
        lessons,
        weather: weatherContext,
        reserveBudget: (limits) => budget.reserve(limits),
      },
      { env },
    );
    await audit(db, req.user!, "assistant.answered", "assistant");
    res.json(result);
  });
  app.post("/api/messages", requireOperator, async (req: AuthRequest, res) => {
    const result = await mutate(db, req, async (tx) => {
      const input = z
        .object({
          contactId: z.string().min(1).max(80),
          body: z.string().trim().min(1).max(1500),
          channel: z.enum(["sms", "whatsapp"]),
        })
        .strict()
        .parse(req.body);
      if (
        !config.demo &&
        env.CHANNEL_ORGANIZATION_ID !== req.user!.organizationId
      )
        throw new ApiError(
          403,
          "CHANNEL_SCOPE_FORBIDDEN",
          "Messaging is not configured for this organization.",
        );
      const contact = await findEntity(
        tx,
        req.user!,
        "contacts",
        input.contactId,
      );
      if (
        !contact.data.consent ||
        !contact.data.consentChannels?.includes(input.channel)
      )
        throw new ApiError(
          409,
          "CONSENT_REQUIRED",
          "Record the contact’s permission for this channel before messaging.",
        );
      const body = await insertEntity(tx, req.user!, "messages", {
        ...input,
        status: "queued",
        dispatchState: "reserved",
      });
      await audit(tx, req.user!, "message.requested", "messages", body.id);
      return { status: 201, body };
    });
    const id = result.body.id;
    // Only one request may move a reserved message to sending.
    const message = await updateRecord(
      db,
      "messages",
      { id, tenantId: req.user!.organizationId },
      { dispatchState: "sending" },
      { bumpVersion: false, where: { dispatchState: "reserved" } },
    );
    if (message) {
      const contact = await findEntity(
        db,
        req.user!,
        "contacts",
        message.data.contactId,
      );
      const configured =
        getChannelReadiness(env).find(
          (item) => item.id === message.data.channel,
        )?.status === "configured";
      const allowed =
        config.demo || !configured
          ? true
          : await reserveMessageBudget(
              db,
              req.user!.organizationId,
              contact.data.phone,
              env,
            );
      const response = config.demo
        ? {
            status: "not_configured" as const,
            error: "Outbound delivery is disabled in the local demonstration.",
          }
        : !allowed
          ? {
              status: "failed" as const,
              error:
                "Daily messaging allowance reached. Contact your administrator.",
              retryable: false,
            }
          : await sendOutbound(
              {
                channel: message.data.channel,
                to: contact.data.phone,
                body: message.data.body,
                idempotencyKey: id,
                consent:
                  contact.data.consent === true &&
                  contact.data.consentChannels?.includes(message.data.channel),
                lastInboundAt:
                  contact.data.lastInboundAt?.[message.data.channel],
              },
              { env },
            );
      await db.transaction(async (tx) => {
        if (response.providerId)
          await tx.query(
            `INSERT INTO channel_deliveries(tenant_id,provider_id,status,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [
              req.user!.organizationId,
              response.providerId,
              response.status,
              new Date().toISOString(),
            ],
          );
        const receipt = response.providerId
          ? await tx.query<{ status: string }>(
              `SELECT status FROM channel_deliveries WHERE tenant_id=$1 AND provider_id=$2 FOR UPDATE`,
              [req.user!.organizationId, response.providerId],
            )
          : { rows: [] };
        const current = await selectRecords(
          tx,
          "messages",
          "tenant_id=$1 AND id=$2",
          [req.user!.organizationId, id],
          "FOR UPDATE",
        );
        const rank: Record<string, number> = {
          not_configured: 0,
          queued: 1,
          sent: 2,
          failed: 3,
          delivered: 4,
        };
        const status = [
          response.status,
          current[0]?.data.status === "queued"
            ? undefined
            : current[0]?.data.status,
          receipt.rows[0]?.status,
        ]
          .filter(Boolean)
          .sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0];
        await updateRecord(
          tx,
          "messages",
          { id, tenantId: req.user!.organizationId },
          { ...response, status, dispatchState: "finished" },
        );
        await audit(tx, req.user!, `message.${status}`, "messages", id);
      });
    }
    const saved = await findEntity(db, req.user!, "messages", id);
    res.status(result.status).json(present(saved));
  });
  app.get(
    "/api/admin/overview",
    requireOperator,
    async (req: AuthRequest, res) => {
      const user = req.user!;
      const [counts, { rows: events }] = await Promise.all([
        countRecords(db, user.organizationId),
        db.query<any>(
          `SELECT id,action,entity_type AS "entityType",created_at AS "createdAt",actor_name AS "actorName" FROM audit_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50`,
          [user.organizationId],
        ),
      ]);
      res.json({
        counts,
        audit: events,
        integrations: [
          ...getChannelReadiness(env),
          await marketData.readiness(),
          {
            id: "weather",
            name: "Weather forecast",
            status: weatherSetupProblem(env) ? "not_configured" : "configured",
            detail: weatherSetupProblem(env)
              ? `Forecasts are off: ${weatherSetupProblem(env)}. Use a licensed Open-Meteo customer endpoint (with OPEN_METEO_API_KEY) or a self-hosted Open-Meteo server.`
              : "Open-Meteo model forecasts. Production needs a licensed or self-hosted endpoint.",
          },
          {
            id: "official-warnings",
            name: "Uganda official warnings",
            status: "available",
            detail:
              "MWE public CAP endpoint; current availability checked when requested.",
          },
          {
            id: "ai",
            name: "AI assistant",
            status: env.OPENAI_API_KEY ? "configured" : "not_configured",
            detail:
              "Key presence does not confirm account funding or successful model access.",
          },
          {
            id: "identity",
            name: "Identity & sessions",
            status: "configured",
            detail: config.demo
              ? "Local demo accounts enabled. Production rejects demo mode."
              : "Password sign-in with opaque server sessions; administrator-provisioned accounts.",
          },
        ],
      });
    },
  );
  const requireAdmin = (
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
  ) => {
    if (req.user?.role !== "admin")
      return next(
        new ApiError(403, "FORBIDDEN", "Administrator access is required."),
      );
    next();
  };
  app.get("/api/admin/lessons", requireAdmin, async (req: AuthRequest, res) =>
    res.json(await getLessons(db, req.user!.organizationId)),
  );
  app.get(
    "/api/admin/lessons/:id",
    requireAdmin,
    async (req: AuthRequest, res) =>
      res.json(
        await getLesson(db, req.user!.organizationId, String(req.params.id)),
      ),
  );
  app.put(
    "/api/admin/lessons/:id",
    requireAdmin,
    async (req: AuthRequest, res) => {
      const result = await mutate(db, req, async (tx) => ({
        status: 200,
        body: await editLesson(tx, req.user!, String(req.params.id), req.body),
      }));
      res.status(result.status).json(result.body);
    },
  );
  app.get("/api/admin/users", requireAdmin, async (req: AuthRequest, res) => {
    const { rows } = await db.query(
      `SELECT id,name,email,phone,role,active,password_change_required AS "passwordChangeRequired",created_at AS "createdAt" FROM users WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`,
      [req.user!.organizationId],
    );
    res.json(rows);
  });
  app.post("/api/admin/users", requireAdmin, async (req: AuthRequest, res) => {
    const schema = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().max(254).optional(),
        phone: z
          .string()
          .regex(/^\+256[37]\d{8}$/)
          .optional(),
        password: z.string().min(14).max(256),
        role: z.enum(["farmer", "operator", "admin"]),
      })
      .strict()
      .refine(
        (input) => Boolean(input.email || input.phone),
        "Email or Uganda phone number is required.",
      );
    const input = schema.parse(req.body);
    const passwordHash = await hashPassword(input.password);
    try {
      const result = await mutate(db, req, async (tx) => {
        const id = randomUUID();
        const { rows } = await tx.query(
          `INSERT INTO users(id,tenant_id,name,email,phone,password_hash,role,password_change_required) VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING id,name,email,phone,role,active,password_change_required AS "passwordChangeRequired",created_at AS "createdAt"`,
          [
            id,
            req.user!.organizationId,
            input.name,
            input.email?.toLowerCase() || null,
            input.phone || null,
            passwordHash,
            input.role,
          ],
        );
        await audit(tx, req.user!, "user.created", "users", id);
        return { status: 201, body: rows[0] };
      });
      res.status(result.status).json(result.body);
    } catch (error: any) {
      if (error.code === "23505")
        throw new ApiError(
          409,
          "IDENTITY_EXISTS",
          "An account already uses that email or phone.",
        );
      throw error;
    }
  });
  app.patch(
    "/api/admin/users/:id",
    requireAdmin,
    async (req: AuthRequest, res) => {
      const result = await mutate(db, req, async (tx) => {
        const { active } = z
          .object({ active: z.boolean() })
          .strict()
          .parse(req.body);
        const id = String(req.params.id);
        const user = req.user!;
        if (id === user.id)
          throw new ApiError(
            409,
            "SELF_ACCESS_CHANGE",
            "Ask another administrator to change your account access.",
          );
        const administrators = await tx.query<{ id: string; active: boolean }>(
          `SELECT id,active FROM users WHERE tenant_id=$1 AND role='admin' ORDER BY id FOR UPDATE`,
          [user.organizationId],
        );
        if (
          !administrators.rows.some(
            (admin) => admin.id === user.id && admin.active,
          )
        )
          throw new ApiError(
            403,
            "FORBIDDEN",
            "Your administrator access is no longer active.",
          );
        if (
          !active &&
          administrators.rows.some(
            (admin) => admin.id === id && admin.active,
          ) &&
          administrators.rows.filter((admin) => admin.active).length <= 1
        )
          throw new ApiError(
            409,
            "LAST_ADMIN",
            "Keep at least one active administrator.",
          );
        const { rows } = await tx.query(
          `UPDATE users SET active=$3 WHERE id=$1 AND tenant_id=$2 RETURNING id,name,email,phone,role,active,password_change_required AS "passwordChangeRequired",created_at AS "createdAt"`,
          [id, user.organizationId, active],
        );
        if (!rows[0]) throw new ApiError(404, "NOT_FOUND", "Member not found.");
        if (!active)
          await tx.query(`DELETE FROM sessions WHERE user_id=$1`, [id]);
        await audit(
          tx,
          user,
          active ? "user.reactivated" : "user.suspended",
          "users",
          id,
        );
        return { status: 200, body: rows[0] };
      });
      res.status(result.status).json(result.body);
    },
  );
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API route not found." } }),
  );
  app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues
            .map(
              (issue) =>
                `${issue.path.join(".") || "request"}: ${issue.message}`,
            )
            .join("; "),
        },
      });
      return;
    }
    if (error instanceof ApiError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof AssistantError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({
        error: {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body is too large.",
        },
      });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body must contain valid JSON.",
        },
      });
      return;
    }
    logger.error("http.unhandled_error", {
      requestId: requestId(res),
      method: req.method,
      path: logPath(req.originalUrl),
      ...errorFields(error),
    });
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed. Please try again.",
        requestId: requestId(res),
      },
    });
  });
  return app;
}
