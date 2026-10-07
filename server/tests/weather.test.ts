import test from "node:test";
import assert from "node:assert/strict";
import { createLogger } from "../observability.js";
import { createWeatherService, weatherSetupProblem } from "../weather.js";

function capture() {
  const entries: Record<string, any>[] = [];
  return {
    entries,
    logger: createLogger((line) => entries.push(JSON.parse(line))),
  };
}
const forecast = () =>
  Response.json({
    current: { temperature_2m: 21, weather_code: 1 },
    daily: {
      time: ["2026-10-08", "2026-10-09"],
      temperature_2m_max: [27, 26],
      temperature_2m_min: [18, 18],
      precipitation_probability_max: [80, 40],
      precipitation_sum: [4, 1],
    },
  });

test("production without a licensed weather source says so and never fetches", async () => {
  const { entries, logger } = capture();
  let calls = 0;
  const weather = createWeatherService(
    { NODE_ENV: "production" },
    (async () => {
      calls++;
      return forecast();
    }) as typeof fetch,
    logger,
  );
  assert.deepEqual(
    entries.map((entry) => [entry.event, entry.problem]),
    [["weather.not_configured", "OPEN_METEO_BASE_URL is not set"]],
  );
  await assert.rejects(weather(0.728, 32.385), (error: any) => {
    assert.equal(error.status, 503);
    assert.equal(error.code, "WEATHER_NOT_CONFIGURED");
    assert.match(error.message, /not set up/);
    assert.doesNotMatch(error.message, /connected/);
    return true;
  });
  assert.equal(calls, 0);
});

test("the production weather source must be an HTTPS URL", () => {
  assert.equal(weatherSetupProblem({}), undefined);
  assert.equal(
    weatherSetupProblem({
      NODE_ENV: "production",
      OPEN_METEO_BASE_URL: "http://weather.internal/v1/forecast",
    }),
    "OPEN_METEO_BASE_URL must use HTTPS",
  );
  assert.equal(
    weatherSetupProblem({
      NODE_ENV: "production",
      OPEN_METEO_BASE_URL: "not a url",
    }),
    "OPEN_METEO_BASE_URL is not a valid URL",
  );
  assert.equal(
    weatherSetupProblem({
      NODE_ENV: "production",
      OPEN_METEO_BASE_URL: "https://customer-api.open-meteo.com/v1/forecast",
    }),
    undefined,
  );
});

test("a configured production source is used", async () => {
  let requested = "";
  const weather = createWeatherService(
    {
      NODE_ENV: "production",
      OPEN_METEO_BASE_URL: "https://customer-api.open-meteo.com/v1/forecast",
      OPEN_METEO_API_KEY: "test-key",
    },
    (async (url: URL) => {
      requested = String(url);
      return forecast();
    }) as unknown as typeof fetch,
  );
  const result = await weather(0.728, 32.385);
  assert.equal(result.current.temperature, 21);
  assert.match(requested, /^https:\/\/customer-api\.open-meteo\.com\//);
  assert.match(requested, /apikey=test-key/);
});

test("outages are logged by reason without coordinates", async () => {
  for (const [failure, reason] of [
    [async () => new Response("busy", { status: 503 }), "http_503"],
    [
      async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
      "timeout",
    ],
    [
      async () => {
        throw new TypeError("fetch failed");
      },
      "network",
    ],
    [async () => Response.json({ current: {} }), "invalid_data"],
  ] as const) {
    const { entries, logger } = capture();
    const weather = createWeatherService(
      {},
      failure as unknown as typeof fetch,
      logger,
    );
    await assert.rejects(weather(0.728, 32.385), (error: any) => {
      assert.equal(error.code, "WEATHER_UNAVAILABLE");
      return true;
    });
    assert.deepEqual(
      entries.map((entry) => [entry.event, entry.reason]),
      [["weather.unavailable", reason]],
    );
    const logged = JSON.stringify(entries);
    assert.equal(logged.includes("0.73"), false);
    assert.equal(logged.includes("32.39"), false);
  }
});
