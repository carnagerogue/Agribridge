/** MET Norway's public Locationforecast. All aggregation is from returned data. */
export function parseMetForecast(raw: any, now = Date.now()) {
  const series = raw?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length)
    throw new Error("Missing forecast periods");
  const available = series.filter((point: any) => {
    const time = Date.parse(point?.time);
    return Number.isFinite(time) && time >= now - 3600_000;
  });
  const current = available[0];
  if (
    !current ||
    Date.parse(current.time) > now + 3600_000 ||
    !Number.isFinite(current.data?.instant?.details?.air_temperature)
  )
    throw new Error("Missing current forecast");
  const groups = new Map<
    string,
    { temperatures: number[]; rain: number; hours: number }
  >();
  let coveredUntil = 0;
  for (const point of available) {
    const start = Date.parse(point.time);
    const temperature = point.data?.instant?.details?.air_temperature;
    if (!Number.isFinite(temperature)) continue;
    const date = new Date(start + 3 * 3600_000).toISOString().slice(0, 10);
    if (!groups.has(date) && groups.size >= 7) break;
    const group = groups.get(date) || { temperatures: [], rain: 0, hours: 0 };
    group.temperatures.push(temperature);
    const hours = point.data?.next_1_hours
      ? 1
      : point.data?.next_6_hours
        ? 6
        : 0;
    const amount =
      point.data?.[`next_${hours}_hours`]?.details?.precipitation_amount;
    if (
      hours &&
      start >= coveredUntil &&
      Number.isFinite(amount) &&
      amount >= 0
    ) {
      group.rain += amount;
      group.hours += hours;
      coveredUntil = start + hours * 3600_000;
    }
    groups.set(date, group);
  }
  const symbol =
    current.data.next_1_hours?.summary?.symbol_code ||
    current.data.next_6_hours?.summary?.symbol_code ||
    "";
  const names: Record<string, string> = {
    clearsky: "Clear",
    fair: "Mainly clear",
    partlycloudy: "Partly cloudy",
    cloudy: "Cloudy",
    fog: "Fog",
    rain: "Rain",
    lightrain: "Light rain",
    heavyrain: "Heavy rain",
    rainshowers: "Rain showers",
    lightrainshowers: "Light rain showers",
    heavyrainshowers: "Heavy rain showers",
  };
  const code = symbol.replace(/_(day|night|polartwilight)$/, "");
  return {
    current: {
      temperature: current.data.instant.details.air_temperature,
      description:
        names[code] ||
        (code.includes("thunder")
          ? "Thunderstorms possible"
          : "Model forecast"),
    },
    days: [...groups]
      .filter(([, group]) => group.hours > 0)
      .map(([date, group]) => ({
        date,
        min: Math.min(...group.temperatures),
        max: Math.max(...group.temperatures),
        rainChance: null,
        rainMm: Math.round(group.rain * 10) / 10,
      })),
  };
}
