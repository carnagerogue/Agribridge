import { ApiError } from "./security.js";
import { silentLogger, type Logger } from "./observability.js";
import { parseMetForecast } from "./met-weather.js";
type Weather = {
  source: string;
  sourceUrl?: string;
  periodNote?: string;
  fetchedAt: string;
  latitude: number;
  longitude: number;
  current: { temperature: number; description: string };
  days: {
    date: string;
    min: number;
    max: number;
    rainChance: number | null;
    rainMm: number;
  }[];
  advisories: { severity: string; title: string; body: string }[];
  stale: boolean;
};
const descriptions: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};
/** Why a forecast failed, for operators; coordinates are never included. */
class WeatherFailure extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}
function failureReason(error: unknown) {
  if (error instanceof WeatherFailure) return error.reason;
  if (error instanceof DOMException && error.name === "TimeoutError")
    return "timeout";
  return error instanceof TypeError ? "network" : "unexpected";
}

/**
 * Production must name a licensed or self-hosted endpoint: Open-Meteo's free
 * public API is for noncommercial use. Returns why the setup is unusable.
 */
export function weatherSetupProblem(env: NodeJS.ProcessEnv) {
  if (env.WEATHER_PROVIDER === "met-no") return undefined;
  if (env.NODE_ENV !== "production") return undefined;
  if (!env.OPEN_METEO_BASE_URL) return "OPEN_METEO_BASE_URL is not set";
  try {
    if (new URL(env.OPEN_METEO_BASE_URL).protocol !== "https:")
      return "OPEN_METEO_BASE_URL must use HTTPS";
  } catch {
    return "OPEN_METEO_BASE_URL is not a valid URL";
  }
  return undefined;
}

export function createWeatherService(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  logger: Logger = silentLogger,
) {
  const cache = new Map<
    string,
    { at: number; nextAt: number; modified?: string; data: Weather }
  >();
  const inflight = new Map<string, Promise<Weather>>();
  const setupProblem = weatherSetupProblem(env);
  if (setupProblem)
    logger.warn("weather.not_configured", { problem: setupProblem });
  return async (latitude: number, longitude: number): Promise<Weather> => {
    // A missing setting is not a connection problem: say so, and never retry.
    if (setupProblem)
      throw new ApiError(
        503,
        "WEATHER_NOT_CONFIGURED",
        "Forecasts are not set up for this service yet. An administrator needs to connect a licensed weather source. Official warnings are shown separately.",
      );
    const lat = Math.round(latitude * 100) / 100;
    const lon = Math.round(longitude * 100) / 100;
    const key = `${lat},${lon}`;
    const previous = cache.get(key);
    if (previous && Date.now() < previous.nextAt) return previous.data;
    if (inflight.has(key)) return inflight.get(key)!;
    const run = (async () => {
      try {
        if (env.WEATHER_PROVIDER === "met-no") {
          const url = new URL(
            "https://api.met.no/weatherapi/locationforecast/2.0/compact",
          );
          url.searchParams.set("lat", String(lat));
          url.searchParams.set("lon", String(lon));
          const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(10000),
            headers: {
              accept: "application/json",
              "User-Agent":
                "Agribridge/0.1 (https://github.com/carnagerogue/Agribridge)",
              ...(previous?.modified
                ? { "If-Modified-Since": previous.modified }
                : {}),
            },
          });
          if (!response.ok && !(response.status === 304 && previous))
            throw new WeatherFailure(`http_${response.status}`);
          const at = Date.now();
          const expires = Date.parse(response.headers.get("expires") || "");
          const nextAt = Math.max(
            at + 30 * 60_000,
            Number.isFinite(expires) ? expires : 0,
          );
          if (response.status === 304 && previous) {
            cache.set(key, { ...previous, at, nextAt });
            return previous.data;
          }
          const parsed = parseMetForecast(await response.json(), at);
          if (!parsed.days.length) throw new WeatherFailure("incomplete_data");
          const data: Weather = {
            source: "MET Norway · model forecast · CC BY 4.0",
            sourceUrl: "https://api.met.no/",
            periodNote:
              "Temperature ranges and rain totals are calculated from available forecast periods, grouped by their start date in Uganda. Today may be partial; later periods span six hours. Rain probability is not supplied.",
            fetchedAt: new Date(at).toISOString(),
            latitude: lat,
            longitude: lon,
            ...parsed,
            stale: false,
            advisories: [
              {
                severity: "info",
                title: "Check the forecast and the field",
                body: "Model forecasts do not confirm soil moisture, pest presence or crop disease. Check local observations and official warnings before acting.",
              },
            ],
          };
          if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
          cache.set(key, {
            at,
            nextAt,
            modified: response.headers.get("last-modified") || undefined,
            data,
          });
          return data;
        }
        const url = new URL(
          env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast",
        );
        for (const [name, value] of Object.entries({
          latitude: String(lat),
          longitude: String(lon),
          current: "temperature_2m,weather_code",
          daily:
            "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
          timezone: "Africa/Kampala",
          forecast_days: "7",
        }))
          url.searchParams.set(name, value);
        if (env.OPEN_METEO_API_KEY)
          url.searchParams.set("apikey", env.OPEN_METEO_API_KEY);
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(7000),
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new WeatherFailure(`http_${response.status}`);
        const raw = (await response.json()) as any;
        if (
          !Number.isFinite(raw.current?.temperature_2m) ||
          !Array.isArray(raw.daily?.time) ||
          raw.daily.time.length < 1
        )
          throw new WeatherFailure("invalid_data");
        const days = raw.daily.time
          .slice(0, 7)
          .map((date: string, index: number) => ({
            date,
            min: raw.daily.temperature_2m_min?.[index],
            max: raw.daily.temperature_2m_max?.[index],
            rainChance: raw.daily.precipitation_probability_max?.[index],
            rainMm: raw.daily.precipitation_sum?.[index],
          }));
        if (
          days.some(
            (day: any) =>
              !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
              [day.min, day.max, day.rainChance, day.rainMm].some(
                (n) => !Number.isFinite(n),
              ),
          )
        )
          throw new WeatherFailure("incomplete_data");
        const advisories: Weather["advisories"] = [
          {
            severity: "info",
            title: "Model forecast, updated regularly",
            body: "Check forecast time and local field conditions. This forecast does not confirm soil moisture, pest presence or crop disease.",
          },
        ];
        if (days.slice(0, 3).some((day: any) => day.rainMm >= 15))
          advisories.push({
            severity: "watch",
            title: "Rain is possible in the next three days",
            body: "Review access paths, covered storage and planned field work. Confirm local conditions before changing planting or water management.",
          });
        const data: Weather = {
          source: "Open-Meteo · model forecast",
          sourceUrl: "https://open-meteo.com/",
          fetchedAt: new Date().toISOString(),
          latitude: lat,
          longitude: lon,
          current: {
            temperature: raw.current.temperature_2m,
            description:
              descriptions[raw.current.weather_code] ||
              "Conditions unavailable",
          },
          days,
          advisories,
          stale: false,
        };
        if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
        cache.set(key, {
          at: Date.now(),
          nextAt: Date.now() + 30 * 60_000,
          data,
        });
        return data;
      } catch (error) {
        const stale =
          previous !== undefined && Date.now() - previous.at < 6 * 3600_000;
        logger.warn("weather.unavailable", {
          reason: failureReason(error),
          servedStaleForecast: stale,
        });
        if (stale) return { ...previous!.data, stale: true };
        throw new ApiError(
          503,
          "WEATHER_UNAVAILABLE",
          "Weather is unavailable. Try again when connected; no forecast has been estimated.",
        );
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, run);
    return run;
  };
}

export function createWarningsService(fetchImpl: typeof fetch = fetch) {
  let cached: { at: number; value: unknown } | undefined;
  return async () => {
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
    try {
      const response = await fetchImpl(
        "https://wids.mwe.go.ug/api/v1/cap/all",
        {
          signal: AbortSignal.timeout(7000),
          headers: { accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error("Provider unavailable");
      const body = (await response.json()) as any;
      if (body.status !== "ok" || !Array.isArray(body.alerts))
        throw new Error("Invalid warnings");
      const value = {
        source: "Uganda MWE Department of Meteorological Services",
        sourceUrl: "https://wids.mwe.go.ug/",
        fetchedAt: new Date().toISOString(),
        status: body.alerts.length ? "active" : "none",
        alerts: body.alerts.slice(0, 100),
        stale: false,
      };
      cached = { at: Date.now(), value };
      return value;
    } catch {
      throw new ApiError(
        503,
        "WARNINGS_UNAVAILABLE",
        "Official Uganda warnings are unavailable. This does not mean no warnings are active.",
      );
    }
  };
}
