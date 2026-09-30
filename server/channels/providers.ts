import type {
  ChannelEnvironment,
  OutboundMessage,
  OutboundResult,
  ProviderOptions,
} from "./types.js";
import { estimateSmsSegments } from "./sms.js";

const PHONE = /^\+[1-9]\d{7,14}$/;
const REQUEST_TIMEOUT_MS = 8_000;
const RESPONSE_LIMIT = 65_536;
const required = (env: ChannelEnvironment, keys: string[]) =>
  keys.every((key) => Boolean(env[key]?.trim()));

function isSmsConfigured(env: ChannelEnvironment) {
  return (
    required(env, ["AT_API_KEY", "AT_USERNAME", "AT_SENDER_ID"]) &&
    ["sandbox", "production"].includes(env.AT_ENVIRONMENT ?? "")
  );
}

function isWhatsAppConfigured(env: ChannelEnvironment) {
  return (
    required(env, [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_API_VERSION",
    ]) &&
    /^\d{5,30}$/.test(env.WHATSAPP_PHONE_NUMBER_ID ?? "") &&
    /^v\d{1,3}\.\d{1,2}$/.test(env.WHATSAPP_API_VERSION ?? "")
  );
}

export function getChannelReadiness(env: ChannelEnvironment = process.env) {
  return [
    {
      id: "sms",
      name: "SMS / Africa's Talking",
      status: isSmsConfigured(env) ? "configured" : "not_configured",
      detail: isSmsConfigured(env)
        ? `Credentials present (${env.AT_ENVIRONMENT}); delivery and funded sender approval still require verification.`
        : "Requires Africa's Talking credentials, an approved sender and explicit sandbox/production environment.",
    },
    {
      id: "whatsapp",
      name: "WhatsApp / Meta",
      status: isWhatsAppConfigured(env) ? "configured" : "not_configured",
      detail: isWhatsAppConfigured(env)
        ? "Credentials present; approved templates or an active service window and consent required."
        : "Requires a Meta access token, phone-number ID and supported Graph API version.",
    },
    {
      id: "ussd",
      name: "USSD",
      status:
        required(env, [
          "AT_WEBHOOK_SECRET",
          "AT_USSD_SERVICE_CODE",
          "CHANNEL_ORGANIZATION_ID",
        ]) && (env.AT_WEBHOOK_SECRET?.length ?? 0) >= 32
          ? "configured"
          : "not_configured",
      detail:
        "Requires a provisioned Uganda shortcode and authenticated provider gateway. Configuration does not prove network availability.",
    },
    {
      id: "voice",
      name: "Voice callbacks",
      status: "not_configured",
      detail:
        "Support requests can be assigned to an operator. Automated calling is not connected.",
    },
  ];
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error("invalid_provider_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > RESPONSE_LIMIT) {
        await reader.cancel();
        throw new Error("invalid_provider_response");
      }
      chunks.push(next.value);
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("invalid_provider_response");
    return data as Record<string, unknown>;
  } finally {
    reader.releaseLock();
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function requestProvider(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<
  { response: Response; data?: Record<string, unknown> } | OutboundResult
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return {
        status: "failed",
        error:
          response.status === 429
            ? "provider_rate_limited"
            : "provider_rejected",
        retryable: false,
        deliveryUncertain: response.status >= 500,
      };
    }
    const data = await readJson(response);
    return { response, data };
  } catch {
    return {
      status: "failed",
      error: controller.signal.aborted
        ? "provider_timeout"
        : "provider_response_unavailable",
      retryable: false,
      deliveryUncertain: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendOutbound(
  input: OutboundMessage,
  options: ProviderOptions = {},
): Promise<OutboundResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (input.consent !== true)
    return { status: "failed", error: "consent_required", retryable: false };
  if (
    !PHONE.test(input.to) ||
    typeof input.body !== "string" ||
    !input.body.trim() ||
    input.body.length > 1600 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.body) ||
    typeof input.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9:_-]{8,160}$/.test(input.idempotencyKey)
  ) {
    return { status: "failed", error: "invalid_message", retryable: false };
  }
  if (input.channel === "sms") {
    if (!isSmsConfigured(env))
      return {
        status: "not_configured",
        error: "sms_not_configured",
        retryable: false,
      };
    const requestedLimit = Number(env.SMS_MAX_SEGMENTS ?? 3);
    const maxSegments =
      Number.isInteger(requestedLimit) &&
      requestedLimit >= 1 &&
      requestedLimit <= 6
        ? requestedLimit
        : 3;
    if (estimateSmsSegments(input.body).segments > maxSegments)
      return { status: "failed", error: "sms_segment_limit", retryable: false };
    const url =
      env.AT_ENVIRONMENT === "sandbox"
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging";
    const result = await requestProvider(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          apiKey: env.AT_API_KEY!,
        },
        body: new URLSearchParams({
          username: env.AT_USERNAME!,
          to: input.to,
          message: input.body,
          from: env.AT_SENDER_ID!,
        }).toString(),
      },
      fetchImpl,
    );
    if ("status" in result) return result;
    const recipients = record(result.data?.SMSMessageData).Recipients;
    const recipient =
      Array.isArray(recipients) && recipients.length === 1
        ? record(recipients[0])
        : {};
    if (
      recipient.number !== input.to ||
      typeof recipient.messageId !== "string" ||
      !recipient.messageId ||
      recipient.messageId.length > 256 ||
      ![100, 101, 102].includes(Number(recipient.statusCode))
    ) {
      return {
        status: "failed",
        error: "provider_acceptance_unconfirmed",
        retryable: false,
        deliveryUncertain: true,
      };
    }
    return {
      status: Number(recipient.statusCode) === 101 ? "sent" : "queued",
      providerId: recipient.messageId,
    };
  }
  if (input.channel !== "whatsapp")
    return { status: "failed", error: "unsupported_channel", retryable: false };
  if (!isWhatsAppConfigured(env))
    return {
      status: "not_configured",
      error: "whatsapp_not_configured",
      retryable: false,
    };
  const now = (options.now ?? Date.now)();
  const inboundAt = input.lastInboundAt ? Date.parse(input.lastInboundAt) : NaN;
  if (
    !input.template &&
    (!Number.isFinite(inboundAt) ||
      inboundAt > now ||
      now - inboundAt >= 24 * 60 * 60 * 1000)
  ) {
    return {
      status: "failed",
      error: "whatsapp_template_required",
      retryable: false,
    };
  }
  if (
    input.template &&
    (!/^[a-z0-9_]{1,128}$/.test(input.template.name) ||
      !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(input.template.languageCode) ||
      (input.template.parameters?.length ?? 0) > 10 ||
      input.template.parameters?.some(
        (value) => typeof value !== "string" || value.length > 500,
      ))
  ) {
    return { status: "failed", error: "invalid_template", retryable: false };
  }
  const content = input.template
    ? {
        type: "template",
        template: {
          name: input.template.name,
          language: { code: input.template.languageCode },
          ...(input.template.parameters?.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: input.template.parameters.map((text) => ({
                      type: "text",
                      text,
                    })),
                  },
                ],
              }
            : {}),
        },
      }
    : { type: "text", text: { preview_url: false, body: input.body } };
  const result = await requestProvider(
    `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to.slice(1),
        ...content,
      }),
    },
    fetchImpl,
  );
  if ("status" in result) return result;
  const messages = result.data?.messages;
  const first =
    Array.isArray(messages) && messages.length === 1 ? record(messages[0]) : {};
  if (typeof first.id !== "string" || !first.id || first.id.length > 256)
    return {
      status: "failed",
      error: "provider_acceptance_unconfirmed",
      deliveryUncertain: true,
      retryable: false,
    };
  return { status: "sent", providerId: first.id };
}
