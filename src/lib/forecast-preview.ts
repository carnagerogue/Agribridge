import type { Forecast } from "../types";

/** A successful retrieval does not turn yesterday's forecast into today's. */
export function forecastPreview(forecast: Forecast, now = new Date()) {
  const fetched = Date.parse(forecast.fetchedAt);
  const stale =
    forecast.stale ||
    !Number.isFinite(fetched) ||
    fetched > now.getTime() + 60_000 ||
    now.getTime() - fetched > 3_600_000;
  const period = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return { stale, today: forecast.days.find((day) => day.date === period) };
}
