import { MARKET_SOURCE } from "../server/market-data.ts";

/**
 * End-to-end runs must not depend on third-party services. Known providers
 * get fixed, clearly fictional responses; any other outbound request fails.
 */
const kampalaDay = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

export const FORECAST_FIXTURE = {
  temperature: 24.5,
  rainMm: [18, 4, 0, 1, 0, 6, 2],
};

function forecast() {
  const days = Array.from({ length: 7 }, (_, index) => kampalaDay(index));
  return {
    current: { temperature_2m: FORECAST_FIXTURE.temperature, weather_code: 61 },
    daily: {
      time: days,
      temperature_2m_max: days.map(() => 27),
      temperature_2m_min: days.map(() => 17),
      precipitation_probability_max: days.map((_, index) =>
        index === 0 ? 80 : 30,
      ),
      precipitation_sum: FORECAST_FIXTURE.rainMm,
    },
  };
}

const CSV_HEADERS =
  "date,admin1,admin2,market,market_id,latitude,longitude,category,commodity,commodity_id,unit,priceflag,pricetype,currency,price,usdprice";
export const MARKET_FIXTURE = {
  market: "E2E fixture market 1",
  commodity: "Beans",
};
function marketCsv() {
  const month = new Date();
  month.setUTCDate(15);
  month.setUTCMonth(month.getUTCMonth() - 1);
  const date = month.toISOString().slice(0, 10);
  const commodities = [
    "Beans",
    "Maize",
    "Cassava",
    "Sorghum",
    "Millet",
    "Groundnuts",
    "Rice",
    "Sweet potatoes",
    "Matooke",
    "Peas",
    "Sesame",
  ];
  const rows = [CSV_HEADERS];
  for (let market = 1; market <= 5; market++)
    commodities.forEach((commodity, index) =>
      rows.push(
        [
          date,
          "Kampala",
          "Central Kampala",
          `E2E fixture market ${market}`,
          String(9000 + market),
          "0.31",
          "32.58",
          "cereals and tubers",
          commodity,
          String(9100 + index),
          "KG",
          "actual",
          "Retail",
          "UGX",
          String(1000 + market * 100 + index * 50),
          "0.30",
        ].join(","),
      ),
    );
  return rows.join("\n");
}

function marketMetadata() {
  return {
    success: true,
    result: {
      license_id: "cc-by-igo",
      license_url: "http://creativecommons.org/licenses/by/3.0/igo/legalcode",
      organization: { name: "wfp" },
      resources: [
        {
          id: "e082d683-cad5-4dcd-bf54-db76ae254d33",
          url: MARKET_SOURCE.downloadUrl,
          last_modified: new Date().toISOString().replace("Z", ""),
        },
      ],
    },
  };
}

export function installExternalStubs() {
  const local = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (["127.0.0.1", "localhost"].includes(url.hostname))
      return local(input, init);
    if (url.origin === "https://api.open-meteo.com")
      return Response.json(forecast());
    if (url.href === "https://wids.mwe.go.ug/api/v1/cap/all")
      return Response.json({ status: "ok", count: 0, alerts: [] });
    if (url.href === MARKET_SOURCE.metadataUrl)
      return Response.json(marketMetadata());
    if (url.href === MARKET_SOURCE.downloadUrl)
      return new Response(marketCsv(), {
        headers: { "content-type": "text/csv" },
      });
    throw new TypeError(
      `Outbound network is disabled in end-to-end tests: ${url.origin}`,
    );
  };
}
