import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, migrate, type Database, type Queryable } from "../db.js";
import { persistWhatsAppInbound } from "../whatsapp.js";
import type { InboundEvent } from "../channels/types.js";
import {
  applyMarketConversationDelivery,
  enqueueMarketConversation,
  getMarketChannelProfile,
  listMarketChannelRegistrations,
  listMarketChannelSupply,
  listMarketBuyerInquiries,
  marketConversationStatus,
} from "../market-conversation.js";
import {
  drainMarketConversationJobs,
  retrieveMarketConversationInformation,
} from "../market-conversation-worker.js";

let db: Database;
let clock = new Date();
let calls = 0;
const env = {
  MARKET_WHATSAPP_ENABLED: "true",
  CHANNEL_ORGANIZATION_ID: "conversation-a",
  MESSAGING_DAILY_LIMIT: "5000",
  MESSAGING_TENANT_DAILY_LIMIT: "5000",
  MESSAGING_RECIPIENT_DAILY_LIMIT: "20",
};
const sends: string[] = [];
const options = {
  now: () => clock,
  limit: 20,
  send: async (message: { body: string }) => {
    calls++;
    sends.push(message.body);
    return { status: "sent" as const, providerId: `market-test-${calls}` };
  },
};
before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await db.query(
    `INSERT INTO organizations(id,name) VALUES('conversation-a','Conversation A'),('conversation-b','Conversation B')`,
  );
});
after(async () => {
  await db?.close();
});

async function inbound(
  phone: string,
  body: string,
  settings: {
    tenant?: string;
    eventId?: string;
    at?: Date;
    unsupported?: boolean;
    environment?: NodeJS.ProcessEnv;
  } = {},
) {
  if (!settings.at) clock = new Date(clock.getTime() + 1000);
  const at = settings.at ?? clock;
  const event: InboundEvent = {
    eventId: settings.eventId ?? `test:${randomUUID()}`,
    channel: "whatsapp",
    provider: "meta",
    from: phone,
    body,
    contentType: settings.unsupported ? "unsupported" : "text",
    occurredAt: at.toISOString(),
    command: body.toLowerCase() === "stop" ? "stop" : "message",
  };
  const tenant = settings.tenant ?? "conversation-a";
  await db.transaction(async (tx) => {
    await persistWhatsAppInbound(tx, tenant, event, { now: clock });
    await enqueueMarketConversation(
      tx,
      tenant,
      event,
      settings.environment ?? env,
      clock,
    );
  });
  return event;
}
async function step(
  phone: string,
  body: string,
  settings: Parameters<typeof inbound>[2] = {},
) {
  const event = await inbound(phone, body, settings);
  await drainMarketConversationJobs(db, settings.environment ?? env, options);
  return (
    await db.query<any>(
      `SELECT * FROM market_conversation_jobs WHERE tenant_id=$1 AND event_id=$2`,
      [settings.tenant ?? "conversation-a", event.eventId],
    )
  ).rows[0];
}
async function draft(phone: string, name = "Nakato") {
  for (const body of [
    "REGISTER",
    "AGREE",
    name,
    `${name} produce`,
    "Kapeeka",
    "Nakaseke",
    "Beans, Maize",
    "1",
  ])
    await step(phone, body);
  return (
    await db.query<any>(
      `SELECT draft FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
      [phone],
    )
  ).rows[0].draft;
}
async function register(phone: string) {
  const proposal = await draft(phone);
  await step(phone, `CONFIRM ${proposal.confirmationToken}`);
  return await getMarketChannelProfile(db, "conversation-a", phone);
}

async function buyingDraft(phone: string, quantity = "600") {
  const needBy = new Date(clock.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  for (const body of [
    "BUY",
    "AGREE",
    "Sample client",
    "Sample restaurant",
    "Kampala",
    "Maize",
    "White",
    quantity,
    "A",
    needBy,
  ])
    await step(phone, body);
  return (
    await db.query<any>(
      `SELECT draft FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
      [phone],
    )
  ).rows[0].draft;
}

test("purchasing inquiry requires separate consent and exact readback, is idempotent and grants no buyer account or financial privilege", async () => {
  const phone = "+256700088201";
  const initial = await step(phone, "BUYER");
  assert.match(initial.reply_body, /AGREE/);
  await step(phone, "Private client");
  assert.equal(
    (await listMarketBuyerInquiries(db, "conversation-a")).items.length,
    0,
  );
  const proposal = await buyingDraft(phone, "1");
  assert.equal(
    proposal.quantityKg,
    1,
    "single-digit quantities must not switch conversation language",
  );
  assert.equal(proposal.buyerStep, "confirm");
  const wrong = await step(phone, "CONFIRM wrong");
  assert.match(wrong.reply_body, /Quantity: 1 kg/);
  assert.equal(
    (await listMarketBuyerInquiries(db, "conversation-a")).items.length,
    0,
  );
  const confirmed = await step(phone, `CONFIRM ${proposal.confirmationToken}`);
  assert.match(
    confirmed.reply_body,
    /No accepted order, reserved stock or payment/,
  );
  const eventId = confirmed.event_id;
  await step(phone, `CONFIRM ${proposal.confirmationToken}`, { eventId });
  const inquiries = (
    await listMarketBuyerInquiries(db, "conversation-a")
  ).items.filter((item) => item.phone === phone);
  assert.equal(inquiries.length, 1);
  assert.equal(inquiries[0].businessName, "Sample restaurant");
  assert.equal(inquiries[0].quantityKg, 1);
  assert.equal(inquiries[0].grade, "A");
  assert.equal(inquiries[0].eventId, eventId);
  assert.equal(
    (await listMarketBuyerInquiries(db, "conversation-b")).items.length,
    0,
  );
  for (const table of ["buyer_accounts", "users", "market_channel_profiles"])
    assert.equal(
      (await db.query(`SELECT id FROM ${table} WHERE phone=$1`, [phone])).rows
        .length,
      0,
    );
  assert.equal((await db.query("SELECT id FROM buyer_orders")).rows.length, 0);
});

test("purchasing STOP clears unsaved requirements and stale confirmation cannot save a restarted or stopped request", async () => {
  const phone = "+256700088202";
  const original = await buyingDraft(phone);
  await step(phone, "RESTART");
  const stale = await step(phone, `CONFIRM ${original.confirmationToken}`);
  assert.match(stale.reply_body, /AGREE/);
  await step(phone, "AGREE");
  await step(phone, "Another client");
  await inbound(phone, "STOP");
  const thread = (
    await db.query<any>(
      `SELECT * FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
      [phone],
    )
  ).rows[0];
  assert.deepEqual(thread.draft, {});
  assert.equal(thread.paused, true);
  assert.equal(thread.consented, false);
  await step(phone, `CONFIRM ${original.confirmationToken}`);
  assert.equal(
    (await listMarketBuyerInquiries(db, "conversation-a")).items.filter(
      (item) => item.phone === phone,
    ).length,
    0,
  );
  const resumed = await step(phone, "BUY");
  assert.match(resumed.reply_body, /AGREE/);
});

test("purchasing units and dates are explicit, and expired readback needs fresh requirements", async () => {
  const phone = "+256700088203";
  for (const body of [
    "PURCHASE",
    "AGREE",
    "Client Three",
    "Shop Three",
    "Wakiso",
    "Beans",
    "UNKNOWN",
  ])
    await step(phone, body);
  const units = await step(phone, "4 bags");
  assert.match(units.reply_body, /kilograms/);
  await step(phone, "2");
  await step(phone, "SKIP");
  const badDate = await step(phone, "2026-02-30");
  assert.match(badDate.reply_body, /YYYY-MM-DD/);
  const futureDate = new Date(clock.getTime() + 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await step(phone, futureDate);
  const proposal = (
    await db.query<any>(
      `SELECT draft FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
      [phone],
    )
  ).rows[0].draft;
  assert.equal(proposal.quantityKg, 2);
  await db.query(
    `UPDATE market_channel_threads SET draft=jsonb_set(draft,'{confirmationExpiresAt}',to_jsonb($2::text)) WHERE tenant_id='conversation-a' AND phone=$1`,
    [phone, new Date(clock.getTime() - 1000).toISOString()],
  );
  const expired = await step(phone, `CONFIRM ${proposal.confirmationToken}`);
  assert.match(expired.reply_body, /expired/);
  assert.equal(
    (await listMarketBuyerInquiries(db, "conversation-a")).items.filter(
      (item) => item.phone === phone,
    ).length,
    0,
  );
});

test("BUYERS remains the farmer demand command while BROWSE uses the public seller catalogue without channel profile defaults", async () => {
  const phone = "+256700088204";
  let request: any;
  const capture = {
    ...options,
    retrieve: async (value: unknown) => {
      request = value;
      return "Recorded source result; no order was accepted.";
    },
  };
  await inbound(phone, "BUYERS Beans");
  await drainMarketConversationJobs(db, env, capture);
  assert.equal(request.kind, "buyers");
  await inbound(phone, "BROWSE Maize | Nakaseke");
  await drainMarketConversationJobs(db, env, capture);
  assert.equal(request.kind, "produce");
  assert.equal(request.crop, "Maize");
  assert.equal(request.district, "Nakaseke");
  const answer = await retrieveMarketConversationInformation(db, request, {
    tenantId: "conversation-a",
    phone,
    language: "en",
    profile: null,
  });
  assert.match(answer, /No currently published non-sample offer/);
  assert.doesNotMatch(answer, /\+256/);
  const unknown = await step(phone, "BROWSE");
  assert.match(unknown.reply_body, /Which crop/);
});

test("WhatsApp business signup needs explicit consent and an exact read-back confirmation, without claiming an app account", async () => {
  const phone = "+256700088001";
  await step(phone, "REGISTER");
  const noConsent = await step(phone, "Nakato");
  assert.match(noConsent.reply_body, /AGREE/);
  const proposal = await draft(phone);
  assert.equal(
    await getMarketChannelProfile(db, "conversation-a", phone),
    null,
  );
  await step(phone, "CONFIRM wrong");
  assert.equal(
    await getMarketChannelProfile(db, "conversation-a", phone),
    null,
  );
  const result = await step(phone, `CONFIRM ${proposal.confirmationToken}`);
  assert.match(result.reply_body, /not a web login/);
  const profile = await getMarketChannelProfile(db, "conversation-a", phone);
  assert.equal(profile?.farmSizeAcres, 1);
  assert.deepEqual(profile?.crops, ["Beans", "Maize"]);
  assert.equal(profile?.applicationAccountLinked, false);
  assert.equal(
    (await db.query(`SELECT id FROM users WHERE phone=$1`, [phone])).rows
      .length,
    0,
  );
  assert.equal(
    await getMarketChannelProfile(db, "conversation-b", phone),
    null,
  );
  assert.equal(
    (await listMarketChannelRegistrations(db, "conversation-b")).items.length,
    0,
  );
});

test("confirmed produce inquiries preserve quantity, variety, location and harvest window without accepting a sale", async () => {
  const phone = "+256700088002";
  const profile = await register(phone);
  for (const body of [
    "SELL",
    "Beans",
    "Nambale",
    "1",
    "2027-02-01",
    "2027-02-10",
  ])
    await step(phone, body);
  assert.equal(
    (await listMarketChannelSupply(db, "conversation-a")).items.length,
    0,
  );
  const thread = (
    await db.query<any>(
      `SELECT draft FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
      [phone],
    )
  ).rows[0];
  const accepted = await step(
    phone,
    `CONFIRM ${thread.draft.confirmationToken}`,
  );
  assert.match(accepted.reply_body, /not yet a published listing/);
  const inquiry = (await listMarketChannelSupply(db, "conversation-a"))
    .items[0];
  assert.equal(inquiry.profileId, profile?.id);
  assert.equal(inquiry.quantityKg, 1);
  assert.equal(inquiry.variety, "Nambale");
  assert.equal(inquiry.harvestFrom, "2027-02-01");
  assert.equal(inquiry.district, "Nakaseke");
  assert.equal(inquiry.status, "submitted");
  assert.equal(
    (await listMarketChannelSupply(db, "conversation-b")).items.length,
    0,
  );
});

test("event deduplication, old callbacks and restarted drafts cannot save an old confirmation", async () => {
  const phone = "+256700088003";
  const eventId = `replay:${randomUUID()}`;
  await step(phone, "REGISTER", { eventId });
  const initialCalls = calls;
  await step(phone, "REGISTER", { eventId });
  assert.equal(calls, initialCalls);
  const stale = await step(phone, "AGREE", {
    at: new Date(clock.getTime() - 60_000),
  });
  assert.equal(stale.status, "cancelled");
  assert.equal(stale.error_code, "out_of_order");
  const proposal = await draft(phone);
  await step(phone, "RESTART");
  await step(phone, `CONFIRM ${proposal.confirmationToken}`);
  assert.equal(
    await getMarketChannelProfile(db, "conversation-a", phone),
    null,
  );
  assert.equal(
    (
      await db.query<any>(
        `SELECT state FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
        [phone],
      )
    ).rows[0].state,
    "consent",
  );
});

test("STOP cancels pending work and clears consent; unsupported media and human requests pause automation", async () => {
  const phone = "+256700088004";
  await inbound(phone, "REGISTER");
  await inbound(phone, "STOP");
  const before = calls;
  await drainMarketConversationJobs(db, env, options);
  assert.equal(calls, before);
  const thread = (
    await db.query<any>(
      `SELECT * FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
      [phone],
    )
  ).rows[0];
  assert.equal(thread.paused, true);
  assert.equal(thread.consented, false);
  await step(phone, "Prices beans");
  assert.equal(calls, before);
  await step(phone, "RESUME");
  const media = await step(phone, "[unsupported audio]", { unsupported: true });
  assert.match(
    media.reply_body,
    /Automated audio\/image understanding is not active/,
  );
  const next = await step(phone, "some more words");
  assert.equal(next.status, "cancelled");
  assert.equal(next.error_code, "automation_paused");
});

test("Luganda is gated on local review and demo replies never send or consume message budget", async () => {
  const phone = "+256700088005";
  const languageCalls = calls;
  const reviewed = await step(phone, "LUGANDA");
  assert.match(reviewed.reply_body, /not been locally verified/);
  assert.equal(calls, languageCalls + 1);
  assert.equal(
    (
      await db.query<any>(
        `SELECT paused FROM market_channel_threads WHERE tenant_id='conversation-a' AND phone=$1`,
        [phone],
      )
    ).rows[0].paused,
    true,
  );
  const demoPhone = "+256700088006";
  const before = calls;
  const demo = await step(demoPhone, "REGISTER", {
    environment: { ...env, AGRIBRIDGE_DEMO: "true" },
  });
  assert.equal(demo.status, "demo");
  assert.equal(calls, before);
  assert.equal(demo.error_code, "demo_delivery_disabled");
  assert.equal(
    (
      await db.query(
        `SELECT id FROM market_conversation_jobs WHERE phone=$1 AND status='sent'`,
        [demoPhone],
      )
    ).rows.length,
    0,
  );
  const disabled = await step("+256700088007", "REGISTER", { environment: {} });
  assert.equal(disabled, undefined);
});

test("retrieval happens outside transactions and preserves provided source answers without fabricated price fallback", async () => {
  const phone = "+256700088008";
  await inbound(phone, "PRICES beans Kampala");
  let lookups = 0;
  await drainMarketConversationJobs(db, env, {
    ...options,
    retrieve: async (request, context) => {
      // A database transaction here would deadlock PGlite if retrieval held one.
      await db.transaction(async (tx) => {
        await tx.query(`SELECT 1`);
      });
      assert.equal(request.kind, "prices");
      assert.equal(context.tenantId, "conversation-a");
      lookups++;
      return "Monthly WFP reference only. Beans at an example market: observation unavailable. No current quote.";
    },
  });
  assert.equal(lookups, 1);
  assert.match(sends.at(-1)!, /Monthly WFP reference only/);
});

test("ambiguous provider outcomes are durable and block later automated replies without resending", async () => {
  const phone = "+256700088009";
  await inbound(phone, "MENU");
  let unknownSends = 0;
  await drainMarketConversationJobs(db, env, {
    ...options,
    send: async () => {
      unknownSends++;
      throw new Error("uncertain provider transport");
    },
  });
  await inbound(phone, "MENU");
  await drainMarketConversationJobs(db, env, {
    ...options,
    send: async () => {
      unknownSends++;
      return { status: "sent" as const };
    },
  });
  assert.equal(unknownSends, 1);
  const statuses = (
    await db.query<{ status: string }>(
      `SELECT status FROM market_conversation_jobs WHERE phone=$1 ORDER BY sequence`,
      [phone],
    )
  ).rows.map((row) => row.status);
  assert.deepEqual(statuses, ["uncertain", "queued"]);
  const status = await marketConversationStatus(db, "conversation-a");
  assert.ok(status.counts.uncertain >= 1);
});

test("expired service windows never send and signed delivery receipts cannot downgrade delivered", async () => {
  const phone = "+256700088010";
  const old = await step(phone, "MENU", {
    at: new Date(clock.getTime() - 25 * 60 * 60 * 1000),
  });
  assert.equal(old.status, "expired");
  const sent = await step(phone, "MENU");
  assert.equal(sent.status, "sent");
  await db.transaction(async (tx) => {
    await applyMarketConversationDelivery(tx, "conversation-a", {
      eventId: "receipt-delivered",
      channel: "whatsapp",
      provider: "meta",
      providerId: sent.provider_id,
      status: "delivered",
      occurredAt: clock.toISOString(),
    });
    await applyMarketConversationDelivery(tx, "conversation-a", {
      eventId: "receipt-old-sent",
      channel: "whatsapp",
      provider: "meta",
      providerId: sent.provider_id,
      status: "sent",
      occurredAt: clock.toISOString(),
    });
  });
  assert.equal(
    (
      await db.query<any>(
        `SELECT status FROM market_conversation_jobs WHERE id=$1`,
        [sent.id],
      )
    ).rows[0].status,
    "delivered",
  );
});

test("two workers serialize one send and a crashed sending lease becomes uncertain instead of being retried", async () => {
  const phone = "+256700088011";
  await inbound(phone, "MENU");
  let concurrentCalls = 0;
  const concurrent = {
    ...options,
    send: async () => {
      concurrentCalls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { status: "sent" as const, providerId: "concurrent-one" };
    },
  };
  await Promise.all([
    drainMarketConversationJobs(db, env, concurrent),
    drainMarketConversationJobs(db, env, concurrent),
  ]);
  assert.equal(concurrentCalls, 1);
  const crashPhone = "+256700088012";
  const event = await inbound(crashPhone, "MENU");
  await db.query(
    `UPDATE market_conversation_jobs SET status='sending',reply_body='Previously reserved send',lease_token='crashed-worker',lease_until=$3 WHERE tenant_id=$1 AND event_id=$2`,
    [
      "conversation-a",
      event.eventId,
      new Date(clock.getTime() - 1000).toISOString(),
    ],
  );
  await drainMarketConversationJobs(db, env, concurrent);
  assert.equal(concurrentCalls, 1);
  assert.equal(
    (
      await db.query<any>(
        `SELECT status,error_code FROM market_conversation_jobs WHERE event_id=$1`,
        [event.eventId],
      )
    ).rows[0].status,
    "uncertain",
  );
});

test("a configured channel worker never claims, recovers or sends another organization's jobs", async () => {
  const phone = "+256700088013";
  const own = await inbound(phone, "MENU");
  const foreign = await inbound(phone, "MENU", {
    tenant: "conversation-b",
    environment: { ...env, CHANNEL_ORGANIZATION_ID: "conversation-b" },
  });
  const before = calls;
  const noScope = await drainMarketConversationJobs(
    db,
    { ...env, CHANNEL_ORGANIZATION_ID: undefined },
    options,
  );
  assert.equal(noScope.processed, 0);
  assert.equal(calls, before);
  await db.query(
    `UPDATE market_conversation_jobs SET status='preparing',lease_until=$3,lease_token='foreign-lease' WHERE tenant_id=$1 AND event_id=$2`,
    [
      "conversation-b",
      foreign.eventId,
      new Date(clock.getTime() - 1000).toISOString(),
    ],
  );
  await drainMarketConversationJobs(db, env, options);
  assert.equal(calls, before + 1);
  assert.equal(
    (
      await db.query<any>(
        `SELECT status FROM market_conversation_jobs WHERE tenant_id='conversation-a' AND event_id=$1`,
        [own.eventId],
      )
    ).rows[0].status,
    "sent",
  );
  const untouched = (
    await db.query<any>(
      `SELECT status,lease_token,attempts FROM market_conversation_jobs WHERE tenant_id='conversation-b' AND event_id=$1`,
      [foreign.eventId],
    )
  ).rows[0];
  assert.equal(untouched.status, "preparing");
  assert.equal(untouched.lease_token, "foreign-lease");
  assert.equal(untouched.attempts, 0);
});

test("STOP after a handoff send reservation blocks the acknowledgement, while a later direct human request can acknowledge", async () => {
  const phone = "+256700088014";
  const handoff = await inbound(phone, "HUMAN");
  let stoppedAfterReservation = false;
  let outgoing = 0;
  const racingDb: Database = {
    query: db.query.bind(db),
    close: async () => {},
    async transaction<T>(work: (tx: Queryable) => Promise<T>) {
      const outcome = await db.transaction(work);
      if (!stoppedAfterReservation) {
        const row = (
          await db.query<any>(
            `SELECT status FROM market_conversation_jobs WHERE tenant_id='conversation-a' AND event_id=$1`,
            [handoff.eventId],
          )
        ).rows[0];
        if (row?.status === "sending") {
          stoppedAfterReservation = true;
          await inbound(phone, "STOP");
        }
      }
      return outcome;
    },
  };
  const sendingOptions = {
    ...options,
    send: async () => {
      outgoing++;
      return { status: "sent" as const, providerId: "handoff-after-stop-test" };
    },
  };
  await drainMarketConversationJobs(racingDb, env, sendingOptions);
  assert.equal(stoppedAfterReservation, true);
  assert.equal(outgoing, 0);
  const cancelled = (
    await db.query<any>(
      `SELECT status,error_code FROM market_conversation_jobs WHERE tenant_id='conversation-a' AND event_id=$1`,
      [handoff.eventId],
    )
  ).rows[0];
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.error_code, "stopped");
  await inbound(phone, "HUMAN");
  await drainMarketConversationJobs(db, env, sendingOptions);
  assert.equal(outgoing, 1);
});
