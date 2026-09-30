import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { rateLimit } from "express-rate-limit";
import type {
  ChannelEnvironment,
  ChannelHandlers,
  DeliveryEvent,
  InboundEvent,
} from "./types.js";
import { classifyInboundCommand } from "./sms.js";

class InvalidPayload extends Error {}
const MAX_EVENTS = 100;
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InvalidPayload();
  return value as Record<string, unknown>;
};
function field(value: unknown, max: number, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.length) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new InvalidPayload();
  return value;
}
function phone(value: unknown, meta = false): string {
  const str = field(value, 20);
  const normalized = meta && !str.startsWith("+") ? `+${str}` : str;
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new InvalidPayload();
  return normalized;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > MAX_EVENTS)
    throw new InvalidPayload();
  return value;
}
function constantEqual(received: string, expected: string) {
  // Hash first to make timingSafeEqual length-independent without allocating attacker-controlled buffers.
  return timingSafeEqual(
    createHash("sha256").update(received).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export function verifyWhatsAppSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (
    !secret ||
    !Buffer.isBuffer(rawBody) ||
    !signature ||
    !/^sha256=[a-f0-9]{64}$/i.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(signature.slice(7), "hex"), expected);
}

function timestamp(value: unknown): string {
  const seconds = field(value, 16);
  if (!/^\d{1,13}$/.test(seconds)) throw new InvalidPayload();
  const milliseconds = Number(seconds) * 1000;
  if (
    milliseconds > Date.now() + 300_000 ||
    milliseconds < Date.UTC(2000, 0, 1)
  )
    throw new InvalidPayload();
  return new Date(milliseconds).toISOString();
}

/** Parse a complete authenticated batch before applying any effects. */
export function parseWhatsAppEvents(
  payload: unknown,
  phoneNumberId: string,
): { inbound: InboundEvent[]; delivery: DeliveryEvent[] } {
  const root = record(payload);
  if (root.object !== "whatsapp_business_account") throw new InvalidPayload();
  const inbound: InboundEvent[] = [];
  const delivery: DeliveryEvent[] = [];
  let entriesSeen = 0;
  for (const entry of array(root.entry)) {
    for (const change of array(record(entry).changes)) {
      entriesSeen += 1;
      if (entriesSeen > MAX_EVENTS) throw new InvalidPayload();
      const item = record(change);
      if (item.field !== "messages") continue;
      const value = record(item.value);
      if (record(value.metadata).phone_number_id !== phoneNumberId)
        throw new InvalidPayload();
      if (value.messages !== undefined) {
        for (const raw of array(value.messages)) {
          const message = record(raw);
          const id = field(message.id, 256);
          const from = phone(message.from, true);
          const occurredAt = timestamp(message.timestamp);
          // Images, audio and unknown types go to an operator without fetching external media.
          const body =
            message.type === "text"
              ? field(record(message.text).body, 4096, true)
              : "[Non-text message received. Operator review required.]";
          inbound.push({
            eventId: `meta:message:${id}`,
            channel: "whatsapp",
            provider: "meta",
            from,
            body,
            contentType: message.type === "text" ? "text" : "unsupported",
            occurredAt,
            command: classifyInboundCommand(body),
          });
        }
      }
      if (value.statuses !== undefined) {
        for (const raw of array(value.statuses)) {
          const status = record(raw);
          const providerId = field(status.id, 256);
          const occurredAt = timestamp(status.timestamp);
          const state = field(status.status, 32);
          const mapped = state === "read" ? "delivered" : state;
          if (!["sent", "delivered", "failed"].includes(mapped)) continue;
          delivery.push({
            eventId: `meta:status:${providerId}:${state}:${status.timestamp}`,
            channel: "whatsapp",
            provider: "meta",
            providerId,
            status: mapped as DeliveryEvent["status"],
            occurredAt,
          });
        }
      }
      if (inbound.length + delivery.length > MAX_EVENTS)
        throw new InvalidPayload();
    }
  }
  return { inbound, delivery };
}

const failure = (res: Response, status: number, code: string) =>
  res.status(status).json({
    error: {
      code,
      message:
        status === 503 ? "Channel service unavailable." : "Callback rejected.",
    },
  });
const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res).catch(next);
  };

export function createChannelRouter(options: {
  handlers: ChannelHandlers;
  env?: ChannelEnvironment;
}) {
  const router = express.Router();
  const env = options.env ?? process.env;
  const { handlers } = options;
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  // Callback routes intentionally precede the session parser and application limiter.
  // Bound unauthenticated traffic here before reading/signing any body.
  router.use(
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: {
          code: "callback_rate_limited",
          message:
            "Callback traffic exceeded the current limit. Please retry later.",
        },
      },
    }),
  );

  router.get("/whatsapp", (req, res) => {
    const expected = env.WHATSAPP_VERIFY_TOKEN;
    if (!expected) return failure(res, 503, "not_configured");
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (
      req.query["hub.mode"] !== "subscribe" ||
      typeof token !== "string" ||
      token.length > 512 ||
      !constantEqual(token, expected) ||
      typeof challenge !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(challenge)
    )
      return failure(res, 403, "invalid_verification");
    return res.type("text/plain").send(challenge);
  });

  router.post(
    "/whatsapp",
    express.raw({ type: "application/json", limit: "128kb" }),
    asyncRoute(async (req, res) => {
      if (
        !env.WHATSAPP_APP_SECRET ||
        !env.WHATSAPP_PHONE_NUMBER_ID ||
        !env.CHANNEL_ORGANIZATION_ID
      )
        return failure(res, 503, "not_configured");
      if (
        !verifyWhatsAppSignature(
          req.body,
          req.get("x-hub-signature-256"),
          env.WHATSAPP_APP_SECRET,
        )
      )
        return failure(res, 401, "invalid_signature");
      let payload: unknown;
      try {
        payload = JSON.parse(req.body.toString("utf8"));
      } catch {
        throw new InvalidPayload();
      }
      const events = parseWhatsAppEvents(payload, env.WHATSAPP_PHONE_NUMBER_ID);
      for (const event of events.inbound) await handlers.handleInbound(event);
      for (const event of events.delivery) await handlers.handleDelivery(event);
      return res.status(200).json({ received: true });
    }),
  );

  // Africa's Talking callbacks must pass through a provider-authenticated gateway that
  // injects this secret. The gateway must strip untrusted incoming copies of the header.
  const authenticateAt = (req: Request, res: Response, next: NextFunction) => {
    const secret = env.AT_WEBHOOK_SECRET;
    if (!secret || secret.length < 32 || !env.CHANNEL_ORGANIZATION_ID)
      return failure(res, 503, "not_configured");
    const supplied = req.get("x-webhook-secret");
    if (!supplied || supplied.length > 512 || !constantEqual(supplied, secret))
      return failure(res, 401, "invalid_callback_auth");
    return next();
  };
  const form = express.urlencoded({
    extended: false,
    limit: "16kb",
    parameterLimit: 20,
  });

  router.post(
    "/sms",
    authenticateAt,
    form,
    asyncRoute(async (req, res) => {
      const body = record(req.body);
      const id = field(body.id, 256);
      const from = phone(body.from);
      const text = field(body.text, 1600, true);
      const occurredAt = new Date(field(body.date, 64));
      if (
        !Number.isFinite(occurredAt.getTime()) ||
        occurredAt.getTime() > Date.now() + 300_000
      )
        throw new InvalidPayload();
      await handlers.handleInbound({
        eventId: `at:message:${id}`,
        channel: "sms",
        provider: "africas_talking",
        from,
        body: text,
        occurredAt: occurredAt.toISOString(),
        command: classifyInboundCommand(text),
      });
      return res.status(200).json({ received: true });
    }),
  );

  router.post(
    "/sms/delivery",
    authenticateAt,
    form,
    asyncRoute(async (req, res) => {
      const body = record(req.body);
      const providerId = field(body.id, 256);
      const state = field(body.status, 32).toLowerCase();
      const mapping: Record<string, DeliveryEvent["status"]> = {
        success: "delivered",
        submitted: "sent",
        sent: "sent",
        buffered: "queued",
        queued: "queued",
        failed: "failed",
        rejected: "failed",
        expired: "failed",
      };
      const status = mapping[state];
      if (!status) throw new InvalidPayload();
      await handlers.handleDelivery({
        eventId: `at:status:${providerId}:${state}`,
        channel: "sms",
        provider: "africas_talking",
        providerId,
        status,
        occurredAt: new Date().toISOString(),
      });
      return res.status(200).json({ received: true });
    }),
  );

  router.post(
    "/ussd",
    authenticateAt,
    form,
    asyncRoute(async (req, res) => {
      if (!env.AT_USSD_SERVICE_CODE) return failure(res, 503, "not_configured");
      const body = record(req.body);
      const sessionId = field(body.sessionId, 160);
      const from = phone(body.phoneNumber);
      const serviceCode = field(body.serviceCode, 40);
      if (serviceCode !== env.AT_USSD_SERVICE_CODE) throw new InvalidPayload();
      const text = field(body.text, 160, true);
      if (!/^[0-9*]*$/.test(text)) throw new InvalidPayload();
      const digest = createHash("sha256")
        .update(JSON.stringify([sessionId, from, serviceCode, text]))
        .digest("hex");
      const response = await handlers.handleUssd({
        eventId: `at:ussd:${digest}`,
        sessionId,
        from,
        serviceCode,
        text,
      });
      if (!/^(CON|END) /.test(response) || response.length > 160)
        throw new Error("Invalid handler response");
      return res.type("text/plain").status(200).send(response);
    }),
  );

  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (
        error instanceof InvalidPayload ||
        (error &&
          typeof error === "object" &&
          "type" in error &&
          [
            "entity.too.large",
            "parameters.too.many",
            "entity.parse.failed",
          ].includes(String(error.type)))
      ) {
        return failure(res, 400, "invalid_payload");
      }
      return failure(res, 503, "callback_processing_unavailable");
    },
  );
  return router;
}
