import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CloudSun } from "lucide-react";
import { useApp } from "../context/AppContext";
import { ApiError, request } from "../lib/api";
import { dateTime, districts } from "../lib/format";
import { forecastPreview } from "../lib/forecast-preview";
import type { Forecast } from "../types";

export function HomeWeather({ district }: { district?: string }) {
  const { online } = useApp();
  const location = districts.find((place) => place.name === district);
  const [state, setState] = useState<{
    district: string;
    forecast?: Forecast;
    error?: "unavailable" | "not_configured";
  } | null>(null);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (!online || !location) return;
    let active = true;
    setClock(new Date());
    setState(null);
    void request<Forecast>(
      `/api/weather?latitude=${location.latitude}&longitude=${location.longitude}`,
    ).then(
      (forecast) => {
        if (active) {
          setClock(new Date());
          setState({ district: location.name, forecast });
        }
      },
      (failure) => {
        if (active)
          setState({
            district: location.name,
            error:
              failure instanceof ApiError &&
              failure.code === "WEATHER_NOT_CONFIGURED"
                ? "not_configured"
                : "unavailable",
          });
      },
    );
    const interval = window.setInterval(() => setClock(new Date()), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [online, location]);
  const current =
    online && location && state?.district === location.name ? state : null;
  const forecast = current?.forecast;
  const preview = forecast ? forecastPreview(forecast, clock) : null;
  const destination = location
    ? `/weather?district=${encodeURIComponent(location.name)}`
    : "/weather";
  return (
    <section className="home-forecast" aria-labelledby="home-weather-title">
      <div className="home-forecast-main">
        <div>
          <h2 id="home-weather-title">
            {location ? `Weather in ${location.name}` : "Your local weather"}
          </h2>
          {forecast && preview ? (
            <div className="home-forecast-reading">
              <CloudSun size={30} strokeWidth={1.5} aria-hidden="true" />
              <strong>{Math.round(forecast.current.temperature)}°C</strong>
              <span>
                {preview.today
                  ? `${preview.today.rainChance}% rain chance today`
                  : forecast.current.description}
              </span>
            </div>
          ) : (
            <p className="home-forecast-empty" role="status">
              {!online
                ? "Reconnect to check your district forecast."
                : !location
                  ? "Choose a district to see its forecast."
                  : current?.error === "not_configured"
                    ? "Forecasts are not set up for this service yet."
                    : current?.error
                      ? "Forecast unavailable. Open weather to try again."
                      : "Checking your district forecast…"}
            </p>
          )}
        </div>
        <Link to={destination} className="text-link">
          View forecast
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {forecast && preview && (
        <>
          {preview.stale && (
            <p className="home-data-warning" role="status">
              Older forecast. Refresh before making field decisions.
            </p>
          )}
          <details className="home-forecast-source">
            <summary>Source & update time</summary>
            <p>
              {forecast.source} · retrieved {dateTime(forecast.fetchedAt)} EAT.
              Forecast for the district centre, not a field measurement.{" "}
              {forecast.current.description}.
              {preview.today
                ? ` Expected rain today: ${preview.today.rainMm.toFixed(1)} mm.`
                : " No rain estimate for today in this response."}
            </p>
          </details>
        </>
      )}
    </section>
  );
}
