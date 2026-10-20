import test from "node:test";
import assert from "node:assert/strict";
import { parseMetForecast } from "../met-weather.js";
import { createWeatherService, weatherSetupProblem } from "../weather.js";

const now = Date.parse("2026-10-20T09:00:00Z");
function point(time: string, temperature: number, one?: number, six?: number) {
  return {
    time,
    data: {
      instant: { details: { air_temperature: temperature } },
      ...(one === undefined
        ? {}
        : {
            next_1_hours: {
              summary: { symbol_code: "partlycloudy_day" },
              details: { precipitation_amount: one },
            },
          }),
      ...(six === undefined
        ? {}
        : { next_6_hours: { details: { precipitation_amount: six } } }),
    },
  };
}
test("MET periods are grouped in Uganda time without double-counting overlapping rain", () => {
  const raw = {
    properties: {
      timeseries: [
        point("2026-10-20T09:00:00Z", 22, 1, 5),
        point("2026-10-20T10:00:00Z", 24, 2),
        point("2026-10-20T21:00:00Z", 20, undefined, 3),
        point("2026-10-21T00:00:00Z", 18, undefined, 4),
      ],
    },
  };
  const result = parseMetForecast(raw, now);
  assert.equal(result.current.temperature, 22);
  assert.equal(result.current.description, "Partly cloudy");
  assert.deepEqual(result.days, [
    { date: "2026-10-20", min: 22, max: 24, rainChance: null, rainMm: 3 },
    { date: "2026-10-21", min: 18, max: 20, rainChance: null, rainMm: 3 },
  ]);
});
test("MET rejects missing or stale current values", () => {
  assert.throws(() => parseMetForecast({}, now));
  assert.throws(() => parseMetForecast(null, now));
  assert.throws(() =>
    parseMetForecast(
      { properties: { timeseries: [point("2020-01-01T00:00:00Z", 20, 1)] } },
      now,
    ),
  );
  assert.throws(() =>
    parseMetForecast(
      { properties: { timeseries: [point("2026-10-21T09:00:00Z", 20, 1)] } },
      now,
    ),
  );
});
test("production MET uses identified requests, attribution and a shared cache", async () => {
  assert.equal(
    weatherSetupProblem({ NODE_ENV: "production", WEATHER_PROVIDER: "met-no" }),
    undefined,
  );
  let calls = 0;
  const current = new Date().toISOString();
  const weather = createWeatherService(
    { NODE_ENV: "production", WEATHER_PROVIDER: "met-no" },
    (async (url, options) => {
      calls++;
      assert.match(
        String(url),
        /^https:\/\/api\.met\.no\/weatherapi\/locationforecast/,
      );
      assert.match(
        new Headers(options?.headers).get("User-Agent")!,
        /Agribridge/,
      );
      return Response.json(
        { properties: { timeseries: [point(current, 24, 1)] } },
        { headers: { expires: new Date(Date.now() + 3600_000).toUTCString() } },
      );
    }) as typeof fetch,
  );
  const result = await weather(0.73, 32.39);
  assert.equal(result.days[0].rainChance, null);
  assert.match(result.source, /MET Norway/);
  await weather(0.73, 32.39);
  assert.equal(calls, 1);
});
