import { describe, expect, it } from "vitest";
import type { Forecast } from "../types";
import { forecastPreview } from "./forecast-preview";

const forecast: Forecast = {
  source: "Test model",
  fetchedAt: "2026-09-28T08:00:00Z",
  latitude: 0,
  longitude: 32,
  current: { temperature: 24, description: "Cloudy" },
  stale: false,
  advisories: [],
  days: [{ date: "2026-09-28", min: 18, max: 26, rainChance: 50, rainMm: 2 }],
};
describe("Home forecast context", () => {
  it("shows current-day rain only and checks source age", () => {
    const result = forecastPreview(forecast, new Date("2026-09-28T08:30:00Z"));
    expect(result.stale).toBe(false);
    expect(result.today?.rainChance).toBe(50);
    expect(
      forecastPreview(forecast, new Date("2026-09-28T09:01:00Z")).stale,
    ).toBe(true);
  });
  it("does not label an older day Today", () => {
    expect(
      forecastPreview(forecast, new Date("2026-09-28T22:00:00Z")).today,
    ).toBeUndefined();
  });
  it("does not trust a stale, invalid or future retrieval date", () => {
    for (const patch of [
      { stale: true },
      { fetchedAt: "bad" },
      { fetchedAt: "2026-10-01T00:00:00Z" },
    ]) {
      expect(
        forecastPreview(
          { ...forecast, ...patch },
          new Date("2026-09-28T08:30:00Z"),
        ).stale,
      ).toBe(true);
    }
  });
});
