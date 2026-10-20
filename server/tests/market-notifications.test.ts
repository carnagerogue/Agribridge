import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openDatabase, migrate, type Database } from "../db.js";
import {
  issueMarketChannelLink,
  consumeMarketChannelLink,
  stopMarketPaymentNotifications,
  drainMarketPaymentNotifications,
  applyMarketNotificationDelivery,
  getMarketNotificationReadiness,
} from "../market-notifications.js";
import type { InboundEvent, OutboundMessage } from "../channels/types.js";
import { createChannelBridge } from "../channel-bridge.js";

const tenant = "notification-test-org";
const env = {
  CHANNEL_ORGANIZATION_ID: tenant,
  MARKET_PAYMENT_NOTIFICATIONS_ENABLED: "true",
  WHATSAPP_ACCESS_TOKEN: "test-only-provider-token",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_API_VERSION: "v23.0",
  MESSAGING_DAILY_LIMIT: "5000",
  MESSAGING_TENANT_DAILY_LIMIT: "5000",
  MESSAGING_RECIPIENT_DAILY_LIMIT: "20",
};
let db: Database;
let phoneSequence = 100;
beforeEach(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await db.query(
    `INSERT INTO organizations(id,name) VALUES($1,'Notification test organization'),('notification-other-org','Other organization')`,
    [tenant],
  );
});
afterEach(async () => {
  await db.close();
});
function event(body: string, phone: string, at = new Date()): InboundEvent {
  return {
    eventId: randomUUID(),
    channel: "whatsapp",
    provider: "meta",
    from: phone,
    body,
    contentType: "text",
    command: "message",
    occurredAt: at.toISOString(),
  };
}
async function fixture(
  options: {
    kind?:
      | "payment_approved"
      | "payment_confirmed"
      | "payment_failed"
      | "payment_refunded";
    status?: string;
    phone?: string;
    scope?: string;
  } = {},
) {
  const seller = randomUUID(),
    buyer = randomUUID(),
    profile = randomUUID(),
    supply = randomUUID(),
    order = randomUUID(),
    payment = randomUUID(),
    notification = randomUUID();
  const phone =
    options.phone ?? `+25670000${String(phoneSequence++).padStart(4, "0")}`;
  const scope = options.scope ?? tenant;
  await db.query(
    `INSERT INTO users(id,tenant_id,name,role) VALUES($1,$3,'Seller','farmer'),($2,$3,'Buyer','farmer')`,
    [seller, buyer, scope],
  );
  await db.query(
    `INSERT INTO market_profiles(id,tenant_id,owner_id,name,business_name,phone,district,community,crops,language) VALUES($1,$2,$3,'Seller','Test farm',$4,'Nakaseke','Test community',ARRAY['Maize'],'en')`,
    [profile, scope, seller, phone],
  );
  await db.query(
    `INSERT INTO market_supply(id,tenant_id,owner_id,profile_id,crop,quantity_kg,expected_price_ugx_per_kg,harvest_from,harvest_until,district,community) VALUES($1,$2,$3,$4,'Maize',100,1000,current_date,current_date+10,'Nakaseke','Test community')`,
    [supply, scope, seller, profile],
  );
  await db.query(
    `INSERT INTO market_orders(id,tenant_id,supply_id,buyer_id,seller_id,quantity_kg,price_ugx_per_kg,total_ugx,crop,district,harvest_from,harvest_until,status,expires_at) VALUES($1,$2,$3,$4,$5,10,1000,10000,'Maize','Nakaseke',current_date,current_date+10,'accepted',now()+interval '7 days')`,
    [order, scope, supply, buyer, seller],
  );
  const status = options.status ?? "succeeded";
  await db.query(
    `INSERT INTO market_payments(id,tenant_id,order_id,provider,transaction_id,payer_id,payee_id,amount_ugx,currency,status,occurred_at) VALUES($1,$2,$3,'fixture-provider',$4,$5,$6,10000,'UGX',$7,now())`,
    [payment, scope, order, randomUUID(), buyer, seller, status],
  );
  await db.query(
    `INSERT INTO market_payment_notifications(id,tenant_id,payment_id,recipient_id,event_id,provider,kind,body) VALUES($1,$2,$3,$4,$5,'fixture-provider',$6,'The provider confirmed direct client-to-seller payment; check provider account.')`,
    [
      notification,
      scope,
      payment,
      seller,
      randomUUID(),
      options.kind ?? "payment_confirmed",
    ],
  );
  return {
    seller,
    buyer,
    profile,
    supply,
    order,
    payment,
    notification,
    phone,
    scope,
  };
}
async function link(f: Awaited<ReturnType<typeof fixture>>, consent = true) {
  const challenge = await issueMarketChannelLink(db, f.scope, f.seller);
  const ownEnv = { ...env, CHANNEL_ORGANIZATION_ID: f.scope };
  await db.transaction((tx) =>
    consumeMarketChannelLink(
      tx,
      f.scope,
      event(challenge.command, f.phone),
      ownEnv,
    ),
  );
  if (consent)
    await db.query(
      `UPDATE market_channel_bindings SET payment_consent=true,consent_at=now() WHERE tenant_id=$1 AND owner_id=$2`,
      [f.scope, f.seller],
    );
  return challenge;
}
async function delivery(notification: string) {
  return (
    await db.query<{
      status: string;
      error_code: string | null;
      provider_id: string | null;
    }>(
      `SELECT status,error_code,provider_id FROM market_notification_deliveries WHERE notification_id=$1`,
      [notification],
    )
  ).rows[0];
}

test("linking stores only a hash, proves channel control, and requires separate payment consent", async () => {
  const f = await fixture();
  const challenge = await issueMarketChannelLink(db, tenant, f.seller);
  const code = challenge.command.slice(5);
  const row = (
    await db.query<any>(
      `SELECT * FROM market_channel_link_challenges WHERE tenant_id=$1 AND owner_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [tenant, f.seller],
    )
  ).rows[0];
  assert.notEqual(row.code_hash, code);
  assert.equal(JSON.stringify(row).includes(code), false);
  assert.equal(
    (
      await db.query(
        `SELECT 1 FROM market_channel_bindings WHERE tenant_id=$1 AND owner_id=$2`,
        [tenant, f.seller],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    await db.transaction((tx) =>
      consumeMarketChannelLink(
        tx,
        tenant,
        event(challenge.command, f.phone),
        env,
      ),
    ),
    true,
  );
  const binding = (
    await db.query<any>(
      `SELECT * FROM market_channel_bindings WHERE tenant_id=$1 AND owner_id=$2`,
      [tenant, f.seller],
    )
  ).rows[0];
  assert.equal(binding.phone, f.phone);
  assert.equal(binding.payment_consent, false);
  assert.equal(
    await db.transaction((tx) =>
      consumeMarketChannelLink(
        tx,
        tenant,
        event(challenge.command, "+256700099999"),
        env,
      ),
    ),
    true,
  );
  assert.equal(
    (
      await db.query<any>(
        `SELECT phone FROM market_channel_bindings WHERE tenant_id=$1 AND owner_id=$2`,
        [tenant, f.seller],
      )
    ).rows[0].phone,
    f.phone,
  );
});

test("expired codes, other tenants and shared phones cannot claim an account", async () => {
  const f = await fixture();
  const expired = await issueMarketChannelLink(
    db,
    tenant,
    f.seller,
    new Date(Date.now() - 16 * 60_000),
  );
  await db.transaction((tx) =>
    consumeMarketChannelLink(tx, tenant, event(expired.command, f.phone), env),
  );
  assert.equal(
    (
      await db.query(
        `SELECT 1 FROM market_channel_bindings WHERE owner_id=$1`,
        [f.seller],
      )
    ).rows.length,
    0,
  );
  const code = await issueMarketChannelLink(db, tenant, f.seller);
  await db.transaction((tx) =>
    consumeMarketChannelLink(
      tx,
      "notification-other-org",
      event(code.command, f.phone),
      env,
    ),
  );
  assert.equal(
    (
      await db.query(
        `SELECT 1 FROM market_channel_bindings WHERE owner_id=$1`,
        [f.seller],
      )
    ).rows.length,
    0,
  );
  await link(f);
  const other = await fixture({ phone: f.phone });
  await link(other);
  assert.equal(
    (
      await db.query(
        `SELECT 1 FROM market_channel_bindings WHERE owner_id=$1`,
        [other.seller],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query<any>(
        `SELECT owner_id FROM market_channel_bindings WHERE tenant_id=$1 AND phone=$2`,
        [tenant, f.phone],
      )
    ).rows[0].owner_id,
    f.seller,
  );
});

test("issuing codes is bounded per account without storing replayable secrets", async () => {
  const f = await fixture();
  for (let i = 0; i < 5; i++)
    await issueMarketChannelLink(db, tenant, f.seller);
  await assert.rejects(
    issueMarketChannelLink(db, tenant, f.seller),
    (error: any) => error.code === "LINK_LIMIT",
  );
  const active = await db.query(
    `SELECT id FROM market_channel_link_challenges WHERE owner_id=$1 AND consumed_at IS NULL`,
    [f.seller],
  );
  assert.equal(active.rows.length, 1);
});

test("a self-declared profile phone never authorizes delivery; linked consent and scope are required", async () => {
  const f = await fixture();
  let calls = 0;
  const send = async () => {
    calls++;
    return { status: "sent" as const, providerId: randomUUID() };
  };
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal((await delivery(f.notification)).status, "awaiting_link");
  await link(f, false);
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal((await delivery(f.notification)).status, "awaiting_consent");
  const other = await fixture({ scope: "notification-other-org" });
  await link(other);
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal(await delivery(other.notification), undefined);
  assert.equal(calls, 0);
});

test("confirmed payment sends once inside the service window and early receipts establish delivery", async () => {
  const f = await fixture();
  await link(f);
  const messages: OutboundMessage[] = [];
  const send = async (message: OutboundMessage) => {
    messages.push(message);
    const id = randomUUID();
    await db.query(
      `INSERT INTO channel_deliveries(tenant_id,provider_id,status,occurred_at) VALUES($1,$2,'delivered',now())`,
      [tenant, id],
    );
    return { status: "sent" as const, providerId: id };
  };
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal(
    messages.filter((m) => m.idempotencyKey === f.notification).length,
    1,
  );
  assert.equal(
    messages.find((m) => m.idempotencyKey === f.notification)?.to,
    f.phone,
  );
  assert.equal((await delivery(f.notification)).status, "delivered");
});

test("outside the service window requires the correct approved event/language template", async () => {
  const f = await fixture({ kind: "payment_approved", status: "authorized" });
  await link(f);
  await db.query(
    `UPDATE whatsapp_threads SET last_request_at=now()-interval '25 hours' WHERE tenant_id=$1 AND from_number=$2`,
    [tenant, f.phone],
  );
  const actual: OutboundMessage[] = [];
  const send = async (message: OutboundMessage) => {
    actual.push(message);
    return { status: "sent" as const, providerId: randomUUID() };
  };
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal(
    (await delivery(f.notification)).status,
    "awaiting_configuration",
  );
  assert.equal(actual.length, 0);
  await drainMarketPaymentNotifications(
    db,
    { ...env, MARKET_PAYMENT_TEMPLATE_APPROVED_EN: "payment_approved_en" },
    { send, limit: 50 },
  );
  assert.equal(actual[0]?.template?.name, "payment_approved_en");
  assert.equal(actual[0]?.template?.languageCode, "en");
  assert.deepEqual(actual[0]?.template?.parameters, [
    "10,000",
    f.order,
    "fixture-provider",
  ]);
  assert.equal(actual[0]?.lastInboundAt, undefined);
});

test("STOP is durable; an old STOP cannot revoke a newer explicit consent", async () => {
  const f = await fixture();
  await link(f);
  await db.transaction((tx) =>
    stopMarketPaymentNotifications(
      tx,
      tenant,
      f.phone,
      new Date().toISOString(),
    ),
  );
  let calls = 0;
  await drainMarketPaymentNotifications(db, env, {
    send: async () => {
      calls++;
      return { status: "sent", providerId: randomUUID() };
    },
    limit: 50,
  });
  assert.equal((await delivery(f.notification)).status, "awaiting_consent");
  assert.equal(calls, 0);
  await db.query(
    `UPDATE market_channel_bindings SET payment_consent=true,consent_at=now() WHERE tenant_id=$1 AND owner_id=$2`,
    [tenant, f.seller],
  );
  await db.transaction((tx) =>
    stopMarketPaymentNotifications(
      tx,
      tenant,
      f.phone,
      new Date(Date.now() - HOUR).toISOString(),
    ),
  );
  assert.equal(
    (
      await db.query<any>(
        `SELECT payment_consent FROM market_channel_bindings WHERE owner_id=$1`,
        [f.seller],
      )
    ).rows[0].payment_consent,
    true,
  );
});
const HOUR = 3_600_000;

test("an uncertain provider result is never automatically resent and may be resolved by a verified receipt", async () => {
  const f = await fixture();
  await link(f);
  const providerId = randomUUID();
  let attempts = 0;
  const send = async () => {
    attempts++;
    return {
      status: "failed" as const,
      deliveryUncertain: true,
      providerId,
      error: "provider_outcome_unknown",
    };
  };
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  const count = attempts;
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal(attempts, count);
  assert.equal((await delivery(f.notification)).status, "uncertain");
  await db.transaction((tx) =>
    applyMarketNotificationDelivery(tx, tenant, {
      eventId: randomUUID(),
      channel: "whatsapp",
      provider: "meta",
      providerId,
      status: "delivered",
      occurredAt: new Date().toISOString(),
    }),
  );
  assert.equal((await delivery(f.notification)).status, "delivered");
  await db.transaction((tx) =>
    applyMarketNotificationDelivery(tx, tenant, {
      eventId: randomUUID(),
      channel: "whatsapp",
      provider: "meta",
      providerId,
      status: "sent",
      occurredAt: new Date().toISOString(),
    }),
  );
  assert.equal((await delivery(f.notification)).status, "delivered");
});

test("demo and disabled modes never send or infer real delivery", async () => {
  const f = await fixture();
  await link(f);
  let calls = 0;
  const send = async () => {
    calls++;
    return { status: "sent" as const, providerId: randomUUID() };
  };
  const disabled = await drainMarketPaymentNotifications(
    db,
    {},
    { send, limit: 50 },
  );
  assert.equal(disabled.disabled, true);
  await drainMarketPaymentNotifications(
    db,
    { ...env, AGRIBRIDGE_DEMO: "true" },
    { send, limit: 50 },
  );
  assert.equal((await delivery(f.notification)).status, "demo");
  assert.equal(calls, 0);
  assert.equal(getMarketNotificationReadiness(env).deliveryVerified, false);
});

test("a conversation's unresolved send blocks payment notifications", async () => {
  const f = await fixture();
  await link(f);
  await db.query(
    `INSERT INTO market_channel_threads(tenant_id,phone) VALUES($1,$2)`,
    [tenant, f.phone],
  );
  await db.query(
    `INSERT INTO market_conversation_jobs(id,tenant_id,phone,event_id,body,content_type,event_at,status,expires_at) VALUES($1,$2,$3,$4,'Question','text',now(),'uncertain',now()+interval '7 days')`,
    [randomUUID(), tenant, f.phone, randomUUID()],
  );
  let calls = 0;
  await drainMarketPaymentNotifications(db, env, {
    send: async () => {
      calls++;
      return { status: "sent", providerId: randomUUID() };
    },
    limit: 50,
  });
  assert.equal((await delivery(f.notification)).status, "blocked");
  assert.equal(calls, 0);
});

test("Luganda notifications require an explicitly configured translated template even in an open window", async () => {
  const f = await fixture();
  await link(f);
  await db.query(
    `UPDATE market_channel_bindings SET language='lg' WHERE tenant_id=$1 AND owner_id=$2`,
    [tenant, f.seller],
  );
  const messages: OutboundMessage[] = [];
  const send = async (message: OutboundMessage) => {
    messages.push(message);
    return { status: "sent" as const, providerId: randomUUID() };
  };
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal(
    (await delivery(f.notification)).status,
    "awaiting_configuration",
  );
  assert.equal(messages.length, 0);
  await drainMarketPaymentNotifications(
    db,
    {
      ...env,
      MARKET_PAYMENT_TEMPLATE_CONFIRMED_LG: "payment_confirmed_luganda",
    },
    { send, limit: 50 },
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].template?.name, "payment_confirmed_luganda");
  assert.equal(messages[0].template?.languageCode, "lg");
});

test("concurrent drains reserve one send; an interrupted send becomes uncertain rather than retryable", async () => {
  const f = await fixture();
  await link(f);
  let release: () => void = () => {};
  let began: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const send = async () => {
    calls++;
    began();
    await held;
    return { status: "sent" as const, providerId: randomUUID() };
  };
  const first = drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  await started;
  await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal((await delivery(f.notification)).status, "sent");
  const interrupted = await fixture();
  await link(interrupted);
  await db.query(
    `INSERT INTO market_notification_deliveries(notification_id,tenant_id,owner_id,phone,status,lease_until) VALUES($1,$2,$3,$4,'sending',now()-interval '1 minute')`,
    [interrupted.notification, tenant, interrupted.seller, interrupted.phone],
  );
  await db.query(
    `UPDATE market_payment_notifications SET status='queued' WHERE id=$1`,
    [interrupted.notification],
  );
  await drainMarketPaymentNotifications(db, env, {
    send: async () => {
      calls++;
      return { status: "sent", providerId: randomUUID() };
    },
    limit: 50,
  });
  assert.equal(calls, 1);
  assert.equal((await delivery(interrupted.notification)).status, "uncertain");
});

function afterBudget(action: () => Promise<void>): Database {
  let active = true;
  return {
    query: <T>(sql: string, values?: unknown[]) => db.query<T>(sql, values),
    close: () => db.close(),
    async transaction(operation) {
      let reserved = false;
      const result = await db.transaction((tx) =>
        operation({
          async query<T>(sql: string, values?: unknown[]) {
            const result = await tx.query<T>(sql, values);
            if (sql.includes("UPDATE messaging_daily_usage SET count=count+1"))
              reserved = true;
            return result;
          },
        }),
      );
      if (active && reserved) {
        active = false;
        await action();
      }
      return result;
    },
  };
}

test("suspension and SMS STOP after budget reservation prevent dispatch", async () => {
  const suspended = await fixture();
  await link(suspended);
  let calls = 0;
  const send = async () => {
    calls++;
    return { status: "sent" as const, providerId: randomUUID() };
  };
  await drainMarketPaymentNotifications(
    afterBudget(async () => {
      await db.query(
        `UPDATE users SET active=false WHERE tenant_id=$1 AND id=$2`,
        [tenant, suspended.seller],
      );
    }),
    env,
    { send, limit: 50 },
  );
  assert.equal(calls, 0);
  assert.equal((await delivery(suspended.notification)).status, "blocked");

  const stopped = await fixture();
  await link(stopped);
  await drainMarketPaymentNotifications(
    afterBudget(async () => {
      await createChannelBridge(db, env).handleInbound({
        ...event("STOP", stopped.phone),
        channel: "sms",
        provider: "africas_talking",
        command: "stop",
      });
    }),
    env,
    { send, limit: 50 },
  );
  assert.equal(calls, 0);
  assert.notEqual((await delivery(stopped.notification)).status, "sent");
  const binding = (
    await db.query<any>(
      `SELECT payment_consent FROM market_channel_bindings WHERE tenant_id=$1 AND owner_id=$2`,
      [tenant, stopped.seller],
    )
  ).rows[0];
  assert.equal(binding.payment_consent, false);
});

test("final authorization rechecks canonical STOP, language and consent snapshots", async () => {
  for (const change of ["stop", "language", "consent"] as const) {
    const f = await fixture();
    await link(f);
    let calls = 0;
    await drainMarketPaymentNotifications(
      afterBudget(async () => {
        if (change === "stop")
          await db.query(
            `UPDATE whatsapp_threads SET last_stop_at=now() WHERE tenant_id=$1 AND from_number=$2`,
            [tenant, f.phone],
          );
        if (change === "language")
          await db.query(
            `UPDATE market_channel_bindings SET language='lg' WHERE tenant_id=$1 AND owner_id=$2`,
            [tenant, f.seller],
          );
        if (change === "consent")
          await db.query(
            `UPDATE market_channel_bindings SET consent_at=now()+interval '1 second' WHERE tenant_id=$1 AND owner_id=$2`,
            [tenant, f.seller],
          );
      }),
      env,
      {
        send: async () => {
          calls++;
          return { status: "sent", providerId: randomUUID() };
        },
        limit: 50,
      },
    );
    assert.equal(calls, 0, change);
    assert.equal((await delivery(f.notification)).status, "blocked", change);
  }
});

test("early failed receipts and direct delivered responses are preserved", async () => {
  const failed = await fixture();
  await link(failed);
  await drainMarketPaymentNotifications(db, env, {
    send: async () => {
      const id = randomUUID();
      await db.query(
        `INSERT INTO channel_deliveries(tenant_id,provider_id,status,occurred_at) VALUES($1,$2,'failed',now())`,
        [tenant, id],
      );
      return { status: "sent", providerId: id };
    },
    limit: 50,
  });
  assert.equal((await delivery(failed.notification)).status, "failed");
  const direct = await fixture();
  await link(direct);
  await drainMarketPaymentNotifications(db, env, {
    send: async () => ({ status: "delivered", providerId: randomUUID() }),
    limit: 50,
  });
  assert.equal((await delivery(direct.notification)).status, "delivered");
});

test("durable receipts close the provider-ID publication race without another send", async () => {
  for (const status of ["delivered", "failed"] as const) {
    const f = await fixture();
    await link(f);
    const providerId = randomUUID();
    let calls = 0;
    const send = async () => {
      calls++;
      return { status: "sent" as const, providerId };
    };
    await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
    assert.equal((await delivery(f.notification)).status, "sent");
    // Simulate a receipt that arrived during finalization before its provider ID
    // could be found by the callback's delivery-table lookup.
    await db.query(
      `INSERT INTO channel_deliveries(tenant_id,provider_id,status,occurred_at) VALUES($1,$2,$3,now())`,
      [tenant, providerId, status],
    );
    await drainMarketPaymentNotifications(db, env, { send, limit: 50 });
    assert.equal((await delivery(f.notification)).status, status);
    assert.equal(calls, 1);
  }
});

test("a scoped demo cannot claim or recover another organization's notification", async () => {
  const other = await fixture({ scope: "notification-other-org" });
  await link(other);
  await db.query(
    `INSERT INTO market_notification_deliveries(notification_id,tenant_id,owner_id,phone,status,lease_until) VALUES($1,$2,$3,$4,'sending',now()-interval '1 minute')`,
    [other.notification, other.scope, other.seller, other.phone],
  );
  await db.query(
    `UPDATE market_payment_notifications SET status='queued' WHERE id=$1`,
    [other.notification],
  );
  await drainMarketPaymentNotifications(
    db,
    { ...env, AGRIBRIDGE_DEMO: "true" },
    {
      send: async () => {
        throw new Error("No send allowed");
      },
      limit: 50,
    },
  );
  assert.equal((await delivery(other.notification)).status, "sending");
  assert.equal(
    (
      await db.query<any>(
        `SELECT status FROM market_payment_notifications WHERE id=$1`,
        [other.notification],
      )
    ).rows[0].status,
    "queued",
  );
  await drainMarketPaymentNotifications(
    db,
    { MARKET_PAYMENT_NOTIFICATIONS_ENABLED: "true" },
    { limit: 50 },
  );
  assert.equal((await delivery(other.notification)).status, "sending");
});

test("long drain passes use a fresh lease clock and recheck the service window before sending", async () => {
  const first = await fixture();
  await link(first);
  const second = await fixture();
  await link(second);
  let timestamp = Date.now();
  const attempted: string[] = [];
  await drainMarketPaymentNotifications(db, env, {
    now: () => new Date(timestamp),
    send: async (message) => {
      const row = (
        await db.query<any>(
          `SELECT lease_until,attempted_at FROM market_notification_deliveries WHERE notification_id=$1`,
          [message.idempotencyKey],
        )
      ).rows[0];
      assert.ok(new Date(row.lease_until).getTime() > timestamp);
      assert.equal(new Date(row.attempted_at).getTime(), timestamp);
      attempted.push(message.idempotencyKey);
      timestamp += 3 * 60_000;
      return { status: "sent", providerId: randomUUID() };
    },
    limit: 50,
  });
  assert.deepEqual(
    attempted.sort(),
    [first.notification, second.notification].sort(),
  );
  const expired = await fixture();
  await link(expired);
  timestamp = Date.now();
  let calls = 0;
  await drainMarketPaymentNotifications(
    afterBudget(async () => {
      timestamp += 25 * HOUR;
    }),
    env,
    {
      now: () => new Date(timestamp),
      send: async () => {
        calls++;
        return { status: "sent", providerId: randomUUID() };
      },
      limit: 50,
    },
  );
  assert.equal(calls, 0);
  assert.equal((await delivery(expired.notification)).status, "blocked");
});
