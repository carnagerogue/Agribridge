import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, migrate, type Database } from "../db.js";
import { seedDemo, DEMO_TENANT } from "../seed.js";
import { createMarketDesk } from "../market-intelligence.js";

let db: Database;
const demo = { AGRIBRIDGE_DEMO: "true", NODE_ENV: "development" };
before(async () => {
  db = await openDatabase({ databasePath: ":memory:" });
  await migrate(db);
  await seedDemo(db);
});
after(async () => {
  await db.close();
});

test("market answers retain source, unit and verification and never use another organization's quotes", async () => {
  const desk = createMarketDesk(db, demo);
  const answer = await desk.answer(
    { question: "What are input costs in Nakaseke?" },
    { organizationId: DEMO_TENANT },
  );
  assert.equal(answer.kind, "inputs");
  assert.equal(answer.available, true);
  assert.match(answer.answer, /SAMPLE/);
  assert.match(answer.answer, /per /);
  assert.match(answer.answer, /valid through/);
  assert.ok(answer.sources.length > 0);
  const other = await desk.answer(
    { question: "What are input costs in Nakaseke?" },
    { organizationId: "another-organization" },
  );
  assert.equal(other.available, false);
  assert.doesNotMatch(other.answer, /SAMPLE/);
});

test("expired source quotes cannot become current input or logistics prices", async () => {
  const future = new Date();
  future.setUTCFullYear(future.getUTCFullYear() + 2);
  const answer = await createMarketDesk(db, demo, { now: () => future }).answer(
    { question: "transport costs in Nakaseke" },
    { organizationId: DEMO_TENANT },
  );
  assert.equal(answer.kind, "logistics");
  assert.equal(answer.available, false);
  assert.match(answer.answer, /No current/);
});

test("buyer answers require a crop and distinguish recorded demand from guaranteed sales", async () => {
  const desk = createMarketDesk(db, demo);
  const unknown = await desk.answer(
    { question: "Find buyers for my harvest" },
    { organizationId: DEMO_TENANT },
  );
  assert.equal(unknown.available, false);
  assert.match(unknown.answer, /Which crop/);
  const beans = await desk.answer(
    { question: "buyers for beans in Nakaseke" },
    { organizationId: DEMO_TENANT },
  );
  assert.equal(beans.available, true);
  assert.match(beans.answer, /SAMPLE/);
  assert.match(beans.answer, /grade and final price need agreement/);
});

test("weather outages are unavailable, never an invented forecast or all-clear", async () => {
  const weather = async () => {
    throw new Error("provider unavailable");
  };
  const answer = await createMarketDesk(db, {}, { weather }).answer(
    { question: "weather in Jinja" },
    { organizationId: DEMO_TENANT },
  );
  assert.equal(answer.kind, "weather");
  assert.equal(answer.available, false);
  assert.match(answer.answer, /Missing data does not mean/);
  const unsupported = await createMarketDesk(db, {}, { weather }).answer(
    { question: "weather", district: "Unmapped district" },
    { organizationId: DEMO_TENANT },
  );
  assert.match(unsupported.answer, /currently mapped/);
});

test("price requests clarify the crop before invoking a source importer", async () => {
  let calls = 0;
  const read = async () => {
    calls++;
    throw new Error("not reached");
  };
  const answer = await createMarketDesk(
    db,
    {},
    { marketData: { read } },
  ).answer({ question: "What is the price?" }, { organizationId: DEMO_TENANT });
  assert.equal(answer.available, false);
  assert.equal(calls, 0);
  assert.match(answer.answer, /Which produce crop/);
});

test("the input desk does not substitute seed prices for fertilizer", async () => {
  const answer = await createMarketDesk(db, demo).answer(
    { question: "fertilizer price for maize in Nakaseke" },
    { organizationId: DEMO_TENANT },
  );
  assert.equal(answer.kind, "inputs");
  assert.equal(answer.available, false);
  assert.doesNotMatch(answer.answer, /seed pack|seed.*UGX/i);
});

test("sample supply and demand cannot become production market facts", async () => {
  const desk = createMarketDesk(db, {
    NODE_ENV: "production",
    AGRIBRIDGE_DEMO: "true",
  });
  for (const question of [
    "input costs in Nakaseke",
    "buyers for beans in Nakaseke",
  ]) {
    const answer = await desk.answer(
      { question },
      { organizationId: DEMO_TENANT },
    );
    assert.equal(answer.available, false);
    assert.doesNotMatch(answer.answer, /SAMPLE/);
  }
});

test("the place and crop in the question override saved profile defaults", async () => {
  const answer = await createMarketDesk(db, demo).answer(
    {
      question: "buyers for beans in Nakaseke",
      crop: "Maize",
      district: "Kampala",
    },
    { organizationId: DEMO_TENANT },
  );
  assert.equal(answer.available, true);
  assert.match(answer.answer, /Beans/);
  assert.match(answer.answer, /Nakaseke/);
  assert.doesNotMatch(answer.answer, /requests .*Maize/);
});
