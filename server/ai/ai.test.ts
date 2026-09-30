import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerQuestion,
  AssistantError,
  getAssistantLimits,
  getAssistantStatus,
  hasSensitiveIdentifiers,
  selectGroundingSources,
} from "./index.js";
import type {
  AssistantContext,
  AssistantLesson,
  AssistantQuestion,
} from "./index.js";

const question: AssistantQuestion = {
  question: "How should I prepare a maize field?",
  crop: "Maize",
  district: "Gulu",
  consent: true,
};
const lesson: AssistantLesson = {
  id: "maize-1",
  crop: "Maize",
  title: "Preparing for maize",
  summary: "Inspect soil and choose suitable seed.",
  sections: [
    {
      heading: "Planning",
      body: "Seek advice from a local extension officer about seed varieties.",
    },
  ],
  sourceTitle: "MAAIF maize field guide",
  sourceUrl: "https://www.agriculture.go.ug/acdp-farmer-guides/",
  reviewStatus: "reviewed",
};
const now = Date.parse("2026-09-28T12:00:00Z");
const env = {
  OPENAI_API_KEY: "test-only-never-a-real-key",
  NODE_ENV: "production",
};
const context: AssistantContext = {
  lessons: [lesson],
  reserveBudget: async () => ({ allowed: true, remaining: 199 }),
};
const neverFetch: typeof fetch = async () => {
  throw new Error("Network must not run");
};
const answerBody = (
  answer = "Inspect the field and discuss suitable varieties with a local extension officer.",
  sourceIds = ["lesson_1"],
) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [
        { type: "output_text", text: JSON.stringify({ answer, sourceIds }) },
      ],
    },
  ],
  usage: { input_tokens: 210, output_tokens: 45 },
});
const mockResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
const errorCode = (code: string) => (error: unknown) =>
  error instanceof AssistantError && error.code === code;

test("AI never calls provider without explicit consent, key, reviewed knowledge or budget", async () => {
  let reservations = 0;
  const scoped = {
    ...context,
    reserveBudget: async () => {
      reservations += 1;
      return { allowed: false, remaining: 0 };
    },
  };
  await assert.rejects(
    answerQuestion({ ...question, consent: false }, scoped, {
      env,
      fetchImpl: neverFetch,
    }),
    errorCode("ai_consent_required"),
  );
  await assert.rejects(
    answerQuestion(question, scoped, { env: {}, fetchImpl: neverFetch }),
    errorCode("ai_not_configured"),
  );
  await assert.rejects(
    answerQuestion(
      question,
      { ...scoped, lessons: [{ ...lesson, reviewStatus: "draft" }] },
      { env, fetchImpl: neverFetch },
    ),
    errorCode("knowledge_not_reviewed"),
  );
  assert.equal(reservations, 0);
  await assert.rejects(
    answerQuestion(question, scoped, { env, fetchImpl: neverFetch }),
    errorCode("ai_budget_reached"),
  );
  assert.equal(reservations, 1);
});

test("AI service fixes cheap model, no storage/tools, and bounded output with source validation", async () => {
  let prompt = "";
  const mockFetch: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init?.redirect, "error");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.reasoning.effort, "none");
    assert.equal(body.max_output_tokens, 600);
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    prompt = body.input;
    assert.ok(!prompt.includes(env.OPENAI_API_KEY));
    assert.ok(!prompt.includes("organizationId"));
    return mockResponse(answerBody());
  };
  const result = await answerQuestion(question, context, {
    env,
    fetchImpl: mockFetch,
    now: () => now,
  });
  assert.equal(result.model, "gpt-6-luna");
  assert.deepEqual(result.sources, [
    { title: lesson.sourceTitle, url: lesson.sourceUrl },
  ]);
  assert.deepEqual(result.usage, { inputTokens: 210, outputTokens: 45 });
  assert.match(prompt, /reviewed/);
});

test("identifiers are rejected before any request and safety referrals never use AI", async () => {
  for (const text of [
    "Call +256 700 000 001",
    "My location is 0.31361, 32.58110",
    "Email mary@example.org",
    "My name is Mary Namusoke",
  ])
    assert.equal(hasSensitiveIdentifiers(text), true);
  await assert.rejects(
    answerQuestion(
      { ...question, question: "Please call +256700000001 about maize." },
      context,
      { env, fetchImpl: neverFetch },
    ),
    errorCode("personal_data_detected"),
  );
  const referral = await answerQuestion(
    { ...question, question: "My child has fever and possible malaria." },
    context,
    { env: {}, fetchImpl: neverFetch },
  );
  assert.equal(referral.model, "safety-guidance");
  assert.equal(referral.usage.inputTokens, 0);
  assert.match(referral.answer, /health worker/);
  const chemical = await answerQuestion(
    { ...question, question: "What pesticide dose should I use?" },
    context,
    { env, fetchImpl: neverFetch },
  );
  assert.match(chemical.answer, /cannot prescribe/);
});

test("only current district forecast and approved source domains are selected", () => {
  const weather = {
    district: "Gulu",
    summary: "Rain possible.",
    sourceTitle: "Open-Meteo model forecast",
    sourceUrl: "https://open-meteo.com/",
    fetchedAt: new Date(now - 1000).toISOString(),
  };
  const sources = selectGroundingSources(
    question,
    {
      ...context,
      weather,
      lessons: [
        lesson,
        { ...lesson, sourceUrl: "https://attacker.example.org/" },
      ],
    },
    env,
    now,
  );
  assert.equal(sources.length, 2);
  assert.equal(sources[1].id, "weather");
  assert.equal(
    selectGroundingSources(
      question,
      { ...context, weather: { ...weather, district: "Kampala" } },
      env,
      now,
    ).length,
    1,
  );
  assert.equal(
    selectGroundingSources(
      question,
      {
        ...context,
        weather: {
          ...weather,
          fetchedAt: new Date(now - 8 * 3600000).toISOString(),
        },
      },
      env,
      now,
    ).length,
    1,
  );
  assert.equal(
    selectGroundingSources(
      question,
      { ...context, lessons: [{ ...lesson, reviewStatus: "draft" }] },
      { ...env, AGRIBRIDGE_DEMO: "true" },
      now,
    ).length,
    0,
  );
});

test("demo draft use is labelled and never silently promoted to reviewed", async () => {
  const result = await answerQuestion(
    question,
    { ...context, lessons: [{ ...lesson, reviewStatus: "draft" }] },
    {
      env: { ...env, NODE_ENV: "development", AGRIBRIDGE_DEMO: "true" },
      fetchImpl: async () => mockResponse(answerBody()),
    },
  );
  assert.match(result.disclaimer, /draft field guides/);
});

test("provider errors, fabricated sources and unsafe output fail closed without leaking data", async () => {
  let calls = 0;
  await assert.rejects(
    answerQuestion(question, context, {
      env,
      fetchImpl: async () => {
        calls += 1;
        return new Response("private provider error", { status: 500 });
      },
    }),
    errorCode("ai_provider_unavailable"),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    answerQuestion(question, context, {
      env,
      fetchImpl: async () =>
        mockResponse(answerBody("Try these steps.", ["made_up"])),
    }),
    errorCode("ai_invalid_response"),
  );
  await assert.rejects(
    answerQuestion(question, context, {
      env,
      fetchImpl: async () => mockResponse(answerBody("Use 50 ml pesticide.")),
    }),
    errorCode("ai_invalid_response"),
  );
  await assert.rejects(
    answerQuestion(question, context, {
      env,
      fetchImpl: async () =>
        mockResponse({ ...answerBody(), status: "incomplete" }),
    }),
    errorCode("ai_incomplete"),
  );
});

test("daily allowances have hard ceilings and status contains no secrets", () => {
  assert.equal(getAssistantLimits({}, now).dailyLimit, 200);
  assert.equal(
    getAssistantLimits({ AI_DAILY_LIMIT: "9000" }, now).dailyLimit,
    0,
  );
  assert.equal(
    getAssistantLimits({ AI_PER_USER_DAILY_LIMIT: "-1" }, now).perUserLimit,
    0,
  );
  assert.equal(getAssistantLimits({}, now).date, "2026-09-28");
  assert.deepEqual(getAssistantStatus(300, {}), {
    configured: false,
    availability: "not_configured",
    model: "gpt-6-luna",
    dailyLimit: 200,
    remaining: 200,
  });
  assert.ok(
    !JSON.stringify(getAssistantStatus(10, env)).includes(env.OPENAI_API_KEY),
  );
});

test("quota exhaustion is a billing problem, not a successful connection or retry loop", async () => {
  let calls = 0;
  await assert.rejects(
    answerQuestion(question, context, {
      env,
      fetchImpl: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            error: {
              code: "insufficient_quota",
              message: "Secret account details",
            },
          }),
          { status: 429 },
        );
      },
    }),
    errorCode("ai_billing_unavailable"),
  );
  assert.equal(calls, 1);
  assert.equal(getAssistantStatus(10, env).availability, "billing_unavailable");
  assert.equal(getAssistantStatus(10, env).configured, true);
});
