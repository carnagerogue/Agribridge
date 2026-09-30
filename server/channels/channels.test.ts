import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { sendOutbound, getChannelReadiness } from "./providers.js";
import { estimateSmsSegments, classifyInboundCommand } from "./sms.js";
import {
  createChannelRouter,
  parseWhatsAppEvents,
  verifyWhatsAppSignature,
} from "./router.js";
import { getUssdDecision, resolveUssd } from "./ussd.js";
import type {
  ChannelEnvironment,
  ChannelHandlers,
  OutboundMessage,
} from "./types.js";

const message: OutboundMessage = {
  channel: "sms",
  to: "+256700000001",
  body: "Rain forecast: check your field before planting.",
  consent: true,
  idempotencyKey: "test-message-0001",
};
const smsEnv = {
  AT_USERNAME: "sandbox",
  AT_API_KEY: "test-only-key",
  AT_SENDER_ID: "AGRIBRIDGE",
  AT_ENVIRONMENT: "sandbox",
};
const whatsappEnv = {
  WHATSAPP_ACCESS_TOKEN: "test-only-token",
  WHATSAPP_PHONE_NUMBER_ID: "12345678901",
  WHATSAPP_API_VERSION: "v25.0",
};
const callbackEnv = {
  ...whatsappEnv,
  WHATSAPP_APP_SECRET: "test-only-signing-secret",
  WHATSAPP_VERIFY_TOKEN: "test-verify-token",
  CHANNEL_ORGANIZATION_ID: "test-organization",
  AT_WEBHOOK_SECRET: "test-callback-secret-at-least-32-characters",
  AT_USSD_SERVICE_CODE: "*123*77#",
};
const neverFetch: typeof fetch = async () => {
  throw new Error("Fetch must not run");
};
const jsonResponse = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });

test("SMS accounting handles GSM extension and Unicode multipart boundaries", () => {
  assert.deepEqual(estimateSmsSegments("A".repeat(160)), {
    encoding: "GSM-7",
    units: 160,
    segments: 1,
  });
  assert.equal(estimateSmsSegments("A".repeat(161)).segments, 2);
  assert.equal(estimateSmsSegments("^".repeat(81)).segments, 2);
  assert.deepEqual(estimateSmsSegments("🙂".repeat(36)), {
    encoding: "Unicode",
    units: 72,
    segments: 2,
  });
  assert.equal(estimateSmsSegments("").segments, 0);
});

test("missing credentials and withdrawn consent never perform network requests", async () => {
  assert.equal(
    (await sendOutbound(message, { env: {}, fetchImpl: neverFetch })).status,
    "not_configured",
  );
  assert.equal(
    (
      await sendOutbound(
        { ...message, consent: false },
        { env: smsEnv, fetchImpl: neverFetch },
      )
    ).error,
    "consent_required",
  );
  assert.equal(
    (
      await sendOutbound(
        { ...message, body: "🙂".repeat(120) },
        { env: smsEnv, fetchImpl: neverFetch },
      )
    ).error,
    "sms_segment_limit",
  );
  assert.ok(
    getChannelReadiness({}).every((item) => item.status === "not_configured"),
  );
  assert.ok(
    !JSON.stringify(getChannelReadiness(smsEnv)).includes("test-only-key"),
  );
});

test("SMS provider acceptance is sent, never handset delivery", async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    assert.equal(
      url,
      "https://api.sandbox.africastalking.com/version1/messaging",
    );
    assert.equal(new URLSearchParams(String(init?.body)).get("to"), message.to);
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    return jsonResponse({
      SMSMessageData: {
        Recipients: [
          {
            number: message.to,
            statusCode: 101,
            status: "Success",
            messageId: "ATX-1",
          },
        ],
      },
    });
  };
  assert.deepEqual(
    await sendOutbound(message, { env: smsEnv, fetchImpl: mockFetch }),
    { status: "sent", providerId: "ATX-1" },
  );
});

test("ambiguous acceptance and transport failure prohibit automatic resend", async () => {
  const malformed = await sendOutbound(message, {
    env: smsEnv,
    fetchImpl: async () => jsonResponse({ message: "Success" }),
  });
  assert.equal(malformed.deliveryUncertain, true);
  assert.equal(malformed.status, "failed");
  const network = await sendOutbound(message, {
    env: smsEnv,
    fetchImpl: async () => {
      throw new Error("secret/phone in upstream error");
    },
  });
  assert.equal(network.retryable, false);
  assert.equal(network.deliveryUncertain, true);
  assert.ok(!JSON.stringify(network).includes("secret/phone"));
  const rejected = await sendOutbound(message, {
    env: smsEnv,
    fetchImpl: async () => new Response("SECRET", { status: 401 }),
  });
  assert.equal(rejected.error, "provider_rejected");
  assert.ok(!JSON.stringify(rejected).includes("SECRET"));
});

test("WhatsApp free text fails without a current trusted service window", async () => {
  const input = { ...message, channel: "whatsapp" as const };
  const options = {
    env: whatsappEnv,
    fetchImpl: neverFetch,
    now: () => Date.parse("2026-09-28T12:00:00Z"),
  };
  assert.equal(
    (await sendOutbound(input, options)).error,
    "whatsapp_template_required",
  );
  assert.equal(
    (
      await sendOutbound(
        { ...input, lastInboundAt: "2026-09-27T12:00:00Z" },
        options,
      )
    ).error,
    "whatsapp_template_required",
  );
  assert.equal(
    (
      await sendOutbound(
        { ...input, lastInboundAt: "2026-09-28T12:01:00Z" },
        options,
      )
    ).error,
    "whatsapp_template_required",
  );
});

test("WhatsApp request uses server credentials and accepted template or recent conversation", async () => {
  let body: Record<string, unknown> = {};
  const mockFetch: typeof fetch = async (url, init) => {
    assert.equal(url, "https://graph.facebook.com/v25.0/12345678901/messages");
    body = JSON.parse(String(init?.body));
    return jsonResponse({ messages: [{ id: "wamid.1" }] });
  };
  const options = {
    env: whatsappEnv,
    fetchImpl: mockFetch,
    now: () => Date.parse("2026-09-28T12:00:00Z"),
  };
  const result = await sendOutbound(
    { ...message, channel: "whatsapp", lastInboundAt: "2026-09-28T11:59:00Z" },
    options,
  );
  assert.equal(body.to, "256700000001");
  assert.equal(body.type, "text");
  assert.deepEqual(result, { status: "sent", providerId: "wamid.1" });
  await sendOutbound(
    {
      ...message,
      channel: "whatsapp",
      template: {
        name: "farm_reminder",
        languageCode: "en",
        parameters: ["check field"],
      },
    },
    options,
  );
  assert.equal(body.type, "template");
});

test("STOP and HELP are explicit while START needs the host consent confirmation flow", () => {
  assert.equal(classifyInboundCommand("stop!"), "stop");
  assert.equal(classifyInboundCommand("  HELP "), "help");
  assert.equal(classifyInboundCommand("START"), "start");
  assert.equal(classifyInboundCommand("stopwatch"), "message");
});

test("USSD is short, explicit about availability, and confirms callbacks before effects", async () => {
  let callbacks = 0;
  assert.ok((await resolveUssd("")).startsWith("CON Agribridge"));
  assert.match(await resolveUssd("1*1"), /Weather unavailable/);
  assert.match(await resolveUssd("2*1"), /No verified market prices/);
  assert.match(await resolveUssd("3*1"), /Reviewed field guide unavailable/);
  const services = {
    requestCallback: async () => {
      callbacks += 1;
      return true;
    },
  };
  assert.match(await resolveUssd("4", services), /Share your phone number/);
  assert.equal(callbacks, 0);
  assert.match(await resolveUssd("4*2", services), /No callback/);
  assert.equal(callbacks, 0);
  assert.match(await resolveUssd("4*1", services), /request saved/);
  assert.equal(callbacks, 1);
  assert.deepEqual(getUssdDecision("1*0*3*2"), {
    action: "lesson",
    value: "Beans",
  });
  assert.equal(
    (await resolveUssd("2*1", { market: async () => "X".repeat(500) })).length,
    160,
  );
  for (const path of ["", "1", "2", "3", "4", "5", "6", "0", "9", "4*1", "5*1"])
    assert.ok((await resolveUssd(path)).length <= 160);
});

function metaPayload(text = "STOP") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: callbackEnv.WHATSAPP_PHONE_NUMBER_ID,
              },
              messages: [
                {
                  id: "wamid.inbound",
                  from: "256700000001",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("WhatsApp signature binds exact bytes and configured recipient number", () => {
  const raw = Buffer.from(JSON.stringify(metaPayload()));
  const signature = `sha256=${createHmac("sha256", callbackEnv.WHATSAPP_APP_SECRET).update(raw).digest("hex")}`;
  assert.equal(
    verifyWhatsAppSignature(raw, signature, callbackEnv.WHATSAPP_APP_SECRET),
    true,
  );
  assert.equal(
    verifyWhatsAppSignature(
      Buffer.concat([raw, Buffer.from(" ")]),
      signature,
      callbackEnv.WHATSAPP_APP_SECRET,
    ),
    false,
  );
  assert.equal(
    verifyWhatsAppSignature(raw, "sha256=bad", callbackEnv.WHATSAPP_APP_SECRET),
    false,
  );
  assert.equal(verifyWhatsAppSignature(raw, signature, undefined), false);
  assert.throws(() => parseWhatsAppEvents(metaPayload(), "other-phone-id"));
  const { inbound } = parseWhatsAppEvents(
    metaPayload(),
    callbackEnv.WHATSAPP_PHONE_NUMBER_ID,
  );
  assert.equal(inbound[0].command, "stop");
  assert.equal(inbound[0].from, message.to);
});

async function withRouter(
  handlers: ChannelHandlers,
  fn: (url: string) => Promise<void>,
  env: ChannelEnvironment = callbackEnv,
) {
  const app = express();
  app.use("/api/channels", createChannelRouter({ handlers, env }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    await fn(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/channels`,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
const noopHandlers: ChannelHandlers = {
  handleInbound: async () => {},
  handleDelivery: async () => {},
  handleUssd: async (request) => resolveUssd(request.text),
};

test("router rejects forged callbacks and acknowledges only persisted authenticated events", async () => {
  let events = 0;
  await withRouter(
    {
      ...noopHandlers,
      handleInbound: async () => {
        events += 1;
      },
    },
    async (url) => {
      assert.equal(
        (
          await fetch(
            `${url}/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123`,
          )
        ).status,
        403,
      );
      const challenge = await fetch(
        `${url}/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=123`,
      );
      assert.equal(await challenge.text(), "123");
      const raw = JSON.stringify(metaPayload());
      assert.equal(
        (
          await fetch(`${url}/whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: raw,
          })
        ).status,
        401,
      );
      assert.equal(events, 0);
      const signature = `sha256=${createHmac("sha256", callbackEnv.WHATSAPP_APP_SECRET).update(raw).digest("hex")}`;
      assert.equal(
        (
          await fetch(`${url}/whatsapp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-hub-signature-256": signature,
            },
            body: raw,
          })
        ).status,
        200,
      );
      assert.equal(events, 1);
      assert.equal(
        (
          await fetch(`${url}/sms`, {
            method: "POST",
            body: new URLSearchParams({ from: message.to }),
          })
        ).status,
        401,
      );
      const response = await fetch(`${url}/ussd`, {
        method: "POST",
        headers: { "x-webhook-secret": callbackEnv.AT_WEBHOOK_SECRET },
        body: new URLSearchParams({
          sessionId: "session-1",
          phoneNumber: message.to,
          serviceCode: "*123*77#",
          text: "",
        }),
      });
      assert.equal(response.status, 200);
      assert.match(await response.text(), /^CON Agribridge/);
    },
  );
});

test("callback database failure returns retriable 503 without leaking errors", async () => {
  await withRouter(
    {
      ...noopHandlers,
      handleDelivery: async () => {
        throw new Error("private db password");
      },
    },
    async (url) => {
      const response = await fetch(`${url}/sms/delivery`, {
        method: "POST",
        headers: { "x-webhook-secret": callbackEnv.AT_WEBHOOK_SECRET },
        body: new URLSearchParams({ id: "ATX-1", status: "Success" }),
      });
      assert.equal(response.status, 503);
      assert.ok(!(await response.text()).includes("password"));
    },
  );
});
