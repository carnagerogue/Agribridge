import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CloudSun,
  Droplets,
  Navigation,
  RefreshCw,
  MapPin,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import { date, dateTime, districts, today } from "../lib/format";
import type { Forecast } from "../types";
import {
  Button,
  Empty,
  ErrorMessage,
  Field,
  Notice,
  PageHeader,
  Skeleton,
} from "../components/ui";
export default function Weather() {
  const { data, online, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const initial =
    params.get("district") ?? data.farms[0]?.district ?? "Nakaseke";
  const [district, setDistrict] = useState(
      districts.some((d) => d.name === initial) ? initial : "Nakaseke",
    ),
    [forecast, setForecast] = useState<Forecast | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [precise, setPrecise] = useState(false);
  const location = districts.find((d) => d.name === district)!;
  const requestNumber = useRef(0);
  const load = useCallback(async (lat: number, lon: number) => {
    const number = ++requestNumber.current;
    setBusy(true);
    setError("");
    setForecast(null);
    try {
      const result = await request<Forecast>(
        `/api/weather?latitude=${lat}&longitude=${lon}`,
      );
      if (number === requestNumber.current) setForecast(result);
    } catch (e) {
      if (number === requestNumber.current) setError((e as Error).message);
    } finally {
      if (number === requestNumber.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (online) {
      setPrecise(false);
      void load(location.latitude, location.longitude);
    }
  }, [district, online, load, location.latitude, location.longitude]);
  function locate() {
    if (!navigator.geolocation) {
      notify(
        "Your device does not provide location. Choose a district instead.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPrecise(true);
        void load(p.coords.latitude, p.coords.longitude);
      },
      () => notify("Location was unavailable. District forecasts still work."),
      { timeout: 10000, maximumAge: 300000 },
    );
  }
  return (
    <>
      <PageHeader
        title="Weather"
        description="Plan with local forecasts. Keep room for changing conditions."
      />
      <div className="toolbar weather-toolbar">
        <Field label="Forecast location">
          <select
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setParams({ district: e.target.value }, { replace: true });
            }}
          >
            {districts.map((d) => (
              <option key={d.name}>{d.name}</option>
            ))}
          </select>
        </Field>
        <Button variant="secondary" onClick={locate} disabled={!online || busy}>
          <Navigation size={17} />
          Use my location
        </Button>
        <Button
          variant="ghost"
          busy={busy}
          onClick={() => {
            setPrecise(false);
            void load(location.latitude, location.longitude);
          }}
          disabled={!online}
        >
          <RefreshCw size={17} />
          Refresh
        </Button>
      </div>
      {error && <ErrorMessage message={error} />}{" "}
      {!online && (
        <Notice tone="warning">
          A fresh forecast needs a connection. Do not rely on old weather
          information for safety decisions.
        </Notice>
      )}
      {busy ? (
        <Skeleton />
      ) : forecast ? (
        <>
          <section className="forecast-hero">
            <div>
              <p className="icon-text">
                <MapPin size={17} />
                {precise ? "Your chosen location" : district}
              </p>
              <div className="forecast-temperature">
                <CloudSun size={70} strokeWidth={1.2} />
                <strong>
                  {Math.round(forecast.current.temperature)}°<span>C</span>
                </strong>
              </div>
              <h2>{forecast.current.description}</h2>
              <p>
                Model forecast · retrieved {dateTime(forecast.fetchedAt)} EAT
              </p>
            </div>
            <div className="forecast-context">
              <h3>Make a plan, then check the field.</h3>
              <p>
                Forecasts describe possible conditions. Your soil, drainage,
                crop stage and local observations still matter.
              </p>
              <small>{forecast.source}</small>
              {forecast.stale && (
                <Notice tone="warning">
                  This is a cached forecast. Refresh before making
                  time-sensitive decisions.
                </Notice>
              )}
            </div>
          </section>
          <section className="panel forecast-days">
            <div className="panel-header">
              <h2>The week ahead</h2>
              <span className="muted">Africa/Kampala · EAT</span>
            </div>
            <div className="days-grid">
              {forecast.days.map((day) => (
                <div className="day" key={day.date}>
                  <strong>
                    {day.date === today()
                      ? "Today"
                      : new Date(day.date + "T12:00:00").toLocaleDateString(
                          "en-UG",
                          { weekday: "short" },
                        )}
                  </strong>
                  <small>{date(day.date)}</small>
                  {day.rainChance > 50 ? (
                    <Droplets size={28} />
                  ) : (
                    <CloudSun size={28} />
                  )}
                  <span className="day-temp">
                    {Math.round(day.max)}° <span>{Math.round(day.min)}°</span>
                  </span>
                  <span className="rain-chance">
                    <Droplets size={13} />
                    {day.rainChance}%
                  </span>
                  <small>{day.rainMm.toFixed(1)} mm</small>
                </div>
              ))}
            </div>
          </section>
          <div className="two-columns">
            <section className="panel">
              <div className="panel-header">
                <h2>Practical considerations</h2>
                <SproutIcon />
              </div>
              {forecast.advisories.length ? (
                forecast.advisories.map((a, i) => (
                  <div className="advisory" key={i}>
                    <h3>{a.title}</h3>
                    <p>{a.body}</p>
                  </div>
                ))
              ) : (
                <p className="panel-body muted">
                  Keep checking local conditions and your regular farm tasks.
                </p>
              )}
            </section>
            <OfficialWarnings />
          </div>
        </>
      ) : (
        !busy &&
        !error && (
          <Empty
            icon={CloudSun}
            title="Your forecast, when you need it."
            body="Choose a district and connect for the latest forecast."
          />
        )
      )}
      {!forecast && <OfficialWarnings />}
      <p className="source-note">
        Forecast data:{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        . Forecast probability is not a guarantee of rainfall at your farm.
      </p>
    </>
  );
}
function SproutIcon() {
  return <CloudSun size={19} />;
}

function OfficialWarnings() {
  const { online } = useApp();
  const [data, setData] = useState<{
    status: string;
    fetchedAt: string;
    alerts: {
      title: string;
      severity: string;
      area_names: string[];
      html_url?: string;
    }[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (online)
      void request<NonNullable<typeof data>>("/api/weather/warnings")
        .then((value) => {
          if (active) {
            setData(value);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [online]);
  function officialUrl(value?: string) {
    try {
      const url = new URL(value ?? "");
      return url.protocol === "https:" &&
        (url.hostname === "mwe.go.ug" || url.hostname.endsWith(".mwe.go.ug"))
        ? url.href
        : undefined;
    } catch {
      return undefined;
    }
  }
  return (
    <section className="panel official-warnings">
      <div className="panel-header">
        <h2>Official weather warnings</h2>
        <ShieldCheck size={19} />
      </div>
      <div className="panel-body">
        <p>Uganda Department of Meteorological Services</p>
        {error && <Notice tone="warning">{error}</Notice>}
        {!online && (
          <Notice tone="warning">
            Reconnect to check current warnings. Offline status is not an
            all-clear.
          </Notice>
        )}
        {data?.alerts.map((warning, i) => (
          <div className="advisory" key={i}>
            <h3>{warning.title}</h3>
            <p>
              {warning.severity} ·{" "}
              {Array.isArray(warning.area_names)
                ? warning.area_names.join(", ")
                : String(warning.area_names ?? "")}
            </p>
            {officialUrl(warning.html_url) && (
              <a
                className="text-link"
                href={officialUrl(warning.html_url)}
                target="_blank"
                rel="noreferrer"
              >
                Read official warning
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        ))}
        {data?.status === "none" && (
          <p className="muted">
            No active warnings returned by the service at{" "}
            {dateTime(data.fetchedAt)} EAT. Continue checking local
            announcements.
          </p>
        )}
        {!data && !error && (
          <p className="muted">Checking the official warning service…</p>
        )}
        <a
          className="text-link"
          href="https://wids.mwe.go.ug/"
          target="_blank"
          rel="noreferrer"
        >
          Open Uganda weather service
          <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
}
