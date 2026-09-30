import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase, migrate } from "../db.js";
import { persistWhatsAppInbound } from "../whatsapp.js";

test("local PostgreSQL-compatible data persists after close and reopen", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agribridge-db-test-"));
  const databasePath = path.join(directory, "fresh-clone", ".data", "db");
  try {
    const first = await openDatabase({ databasePath });
    await migrate(first);
    await first.query(`INSERT INTO organizations(id,name) VALUES($1,$2)`, [
      "durable",
      "Durable test organization",
    ]);
    const incoming = {
      eventId: "durable-whatsapp-event",
      channel: "whatsapp" as const,
      provider: "meta" as const,
      from: "+256700099980",
      body: "Persistence test only",
      command: "message" as const,
      occurredAt: new Date().toISOString(),
    };
    const inboxId = await first.transaction((tx) =>
      persistWhatsAppInbound(tx, "durable", incoming),
    );
    await first.query(
      `INSERT INTO users(id,tenant_id,name,role) VALUES('durable-operator','durable','Test operator','operator')`,
    );
    await first.query(
      `INSERT INTO whatsapp_replies(id,tenant_id,inbox_id,actor_id,idempotency_key,request_hash,body,created_at,expires_at) VALUES('durable-reply','durable',$1,'durable-operator','durable-test-key','test-hash','Uncertain test reply',now(),now()+interval '30 days')`,
      [inboxId],
    );
    await first.close();
    const second = await openDatabase({ databasePath });
    try {
      await migrate(second);
      const { rows } = await second.query<{ name: string }>(
        `SELECT name FROM organizations WHERE id=$1`,
        ["durable"],
      );
      assert.equal(rows[0].name, "Durable test organization");
      assert.equal(
        await second.transaction((tx) =>
          persistWhatsAppInbound(tx, "durable", incoming),
        ),
        undefined,
      );
      const reply = await second.query<{
        body: string;
        status: string;
        delivery_uncertain: boolean;
      }>(
        `SELECT body,status,delivery_uncertain FROM whatsapp_replies WHERE id='durable-reply'`,
      );
      assert.equal(reply.rows[0].body, "Uncertain test reply");
      assert.equal(reply.rows[0].status, "queued");
      assert.equal(reply.rows[0].delivery_uncertain, true);
    } finally {
      await second.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
