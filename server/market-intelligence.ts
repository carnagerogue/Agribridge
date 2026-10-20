import type { Express } from "express";
import { z } from "zod";
import type { Database } from "./db.js";
import type { AppConfig } from "./config.js";
import type { AuthRequest } from "./security.js";
import { createMarketDataService, MARKET_SOURCE } from "./market-data.js";
import { createWeatherService } from "./weather.js";
import { ugandaCalendarDay } from "./workflows.js";

export type MarketDeskAnswer = {
  answer: string;
  kind: "prices" | "weather" | "inputs" | "logistics" | "buyers" | "help";
  sources: { title: string; url?: string; observedAt?: string }[];
  available: boolean;
};
const inputSchema = z
  .object({
    question: z.string().trim().min(2).max(600),
    crop: z.string().trim().max(100).optional(),
    district: z.string().trim().max(100).optional(),
  })
  .strict();
const crops = [
  "Sweet potatoes",
  "Groundnuts",
  "Sorghum",
  "Sunflower",
  "Matooke",
  "Cassava",
  "Banana",
  "Sesame",
  "Millet",
  "Coffee",
  "Maize",
  "Beans",
  "Rice",
];
const points: Record<string, [number, number]> = {
  Kampala: [0.3136, 32.5811],
  Wakiso: [0.4044, 32.4594],
  Nakaseke: [0.728, 32.385],
  Kiboga: [0.916, 31.774],
  Jinja: [0.4479, 33.2026],
  Mbale: [1.0821, 34.175],
  Gulu: [2.7724, 32.2881],
  Mbarara: [-0.6072, 30.6545],
};
const money = (value: number) =>
  new Intl.NumberFormat("en-UG", { maximumFractionDigits: 2 }).format(value);
const day = (value: string | Date) =>
  new Date(value).toISOString().slice(0, 10);
const plain = (value: unknown) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .slice(0, 220);

/** Facts are retrieved from structured records. The model never supplies a price or a buyer. */
export function createMarketDesk(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: {
    marketData?: Pick<ReturnType<typeof createMarketDataService>, "read">;
    weather?: ReturnType<typeof createWeatherService>;
    now?: () => Date;
  } = {},
) {
  const marketData = dependencies.marketData ?? createMarketDataService(db);
  const weather = dependencies.weather ?? createWeatherService(env);
  const includeSamples =
    env.AGRIBRIDGE_DEMO === "true" && env.NODE_ENV !== "production";
  return {
    async answer(
      raw: unknown,
      principal: { organizationId: string },
    ): Promise<MarketDeskAnswer> {
      const input = inputSchema.parse(raw);
      const q = input.question.toLocaleLowerCase();
      const searchable = ` ${q.replace(/[^\p{L}\p{N}]+/gu, " ")} `;
      const today = ugandaCalendarDay(dependencies.now?.() ?? new Date());
      const crop =
        crops.find((name) => searchable.includes(` ${name.toLowerCase()} `)) ||
        input.crop ||
        "";
      const locations = await db.query<{ district: string }>(
        `SELECT district FROM market_demand WHERE tenant_id=$1 UNION SELECT district FROM market_services WHERE tenant_id=$1 LIMIT 200`,
        [principal.organizationId],
      );
      const districts = [
        ...new Set([
          ...Object.keys(points),
          ...locations.rows.map((r) => r.district),
        ]),
      ];
      const district =
        districts
          .sort((a, b) => b.length - a.length)
          .find((name) => q.includes(name.toLowerCase())) ||
        input.district ||
        "";
      const kind: MarketDeskAnswer["kind"] =
        /weather|rain|forecast|temperature|enkuba|obudde/.test(q)
          ? "weather"
          : /transport|storage|logistic|truck|warehouse|drying|entambula|etterekero/.test(
                q,
              )
            ? "logistics"
            : /input|fertili[sz]er|seed|pesticide|herbicide|insecticide|equipment|tractor|sprayer|ebigimusa|ensigo|\bnpk\b|\burea\b|\bdap\b/.test(
                  q,
                )
              ? "inputs"
              : /buyer|buying|sell|demand|market for|abagula|akatale/.test(q)
                ? "buyers"
                : /price|cost|rate|beeyi|omuwendo/.test(q)
                  ? "prices"
                  : "help";
      const result = (
        answer: string,
        available = false,
        sources: MarketDeskAnswer["sources"] = [],
      ): MarketDeskAnswer => ({ answer, kind, available, sources });
      if (kind === "help")
        return result(
          "Ask about produce prices, input costs, transport, storage, buyer requests or a district weather forecast. Include a crop and district when you can. For a sale, register your business and record quantity, variety and harvest dates in My produce. A cooperative operator can help with an introduction.",
        );
      if (kind === "weather") {
        const name = Object.keys(points).find(
          (key) => key.toLowerCase() === district.toLowerCase(),
        );
        if (!name)
          return result(
            `Which district? Forecasts are currently mapped for ${Object.keys(points).join(", ")}. We do not infer a forecast for an unsupported location.`,
          );
        try {
          const forecast = await weather(...points[name]);
          const days = forecast.days
            .slice(0, 3)
            .map(
              (d) =>
                `${d.date}: ${d.min}–${d.max}°C; rainfall ${d.rainMm} mm; rain chance ${d.rainChance}%`,
            )
            .join("\n");
          return result(
            `${name} district model forecast${forecast.stale ? " (saved forecast; refresh unavailable)" : ""}:\n${days}\nSource: ${forecast.source}. Retrieved ${forecast.fetchedAt}. This is a model forecast, not a field observation or official all-clear.`,
            true,
            [
              {
                title: forecast.source,
                url: "https://open-meteo.com/",
                observedAt: forecast.fetchedAt,
              },
            ],
          );
        } catch {
          return result(
            `The ${name} forecast is unavailable. Please try later or ask your cooperative for an official update. Missing data does not mean there is no weather warning.`,
          );
        }
      }
      if (kind === "inputs" || kind === "logistics") {
        const storage = /storage|warehouse|drying|etterekero/.test(q),
          transport = /transport|truck|entambula/.test(q);
        const categories =
          kind === "inputs"
            ? ["input"]
            : storage && transport
              ? ["transport", "storage"]
              : storage
                ? ["storage"]
                : transport
                  ? ["transport"]
                  : ["transport", "storage"];
        const inputGroups = [
          ["urea"],
          ["npk"],
          ["dap"],
          ["fertilizer", "fertiliser", "ebigimusa", "npk", "urea", "dap"],
          ["seed", "ensigo"],
          ["herbicide"],
          ["insecticide"],
          ["fungicide"],
          ["pesticide"],
          ["tractor"],
          ["sprayer"],
        ];
        const itemTerms =
          kind === "inputs"
            ? (inputGroups.find((group) =>
                group.some(
                  (word) =>
                    searchable.includes(` ${word} `) ||
                    searchable.includes(` ${word}s `),
                ),
              ) ?? [])
            : [];
        const rows = await db.query<Record<string, any>>(
          `SELECT * FROM market_services WHERE tenant_id=$1 AND category=ANY($2::text[]) AND observed_at <= $3::date AND valid_until >= $3::date AND ($4='' OR lower(district)=lower($4)) AND ($5='' OR crop='' OR lower(crop)=lower($5)) AND ($6::boolean OR sample=false) AND (cardinality($7::text[])=0 OR EXISTS(SELECT 1 FROM unnest($7::text[]) AS needle(value) WHERE position(needle.value in lower(name))>0)) ORDER BY (verification_status='verified') DESC,observed_at DESC,id LIMIT 6`,
          [
            principal.organizationId,
            categories,
            today,
            district,
            crop,
            includeSamples,
            itemTerms,
          ],
        );
        if (!rows.rows.length)
          return result(
            `No current ${kind === "inputs" ? "input-cost" : "transport/storage"} quotes are recorded${district ? ` for ${district}` : ""}${crop ? ` for ${crop}` : ""}. Tell your cooperative the item, quantity, location and date needed so they can obtain a current quote for you.`,
          );
        return result(
          rows.rows
            .map(
              (r) =>
                `${r.sample ? "SAMPLE · " : ""}${plain(r.name)} — ${plain(r.provider)}, ${plain(r.district)}: UGX ${money(r.price_ugx)} per ${plain(r.unit)}. ${r.verification_status === "verified" ? "Staff-verified record" : "Reported record; confirm with provider"}. Observed ${day(r.observed_at)}; valid through ${day(r.valid_until)}. Source: ${plain(r.source_title)}.`,
            )
            .join("\n\n") +
            "\n\nAsk the provider to confirm availability, route/capacity, and any additional charges before committing.",
          true,
          rows.rows.map((r) => ({
            title: plain(r.source_title),
            ...(r.source_url ? { url: r.source_url } : {}),
            observedAt: day(r.observed_at),
          })),
        );
      }
      if (kind === "buyers") {
        if (!crop)
          return result(
            "Which crop or variety are you selling? Include quantity, district and your expected harvest window. Buyer demand is different from a published market-reference price.",
          );
        const { rows } = await db.query<Record<string, any>>(
          `SELECT * FROM market_demand WHERE tenant_id=$1 AND status='open' AND deadline >= $2::date AND lower(crop)=lower($3) AND ($4='' OR lower(district)=lower($4)) AND ($5::boolean OR sample=false) ORDER BY deadline,id LIMIT 5`,
          [principal.organizationId, today, crop, district, includeSamples],
        );
        if (!rows.length)
          return result(
            `No open ${crop} buyer requests are recorded${district ? ` in ${district}` : ""}. You can still record your produce and ask staff to find a buyer; no sale or buyer demand is guaranteed.`,
          );
        return result(
          rows
            .map(
              (r) =>
                `${r.sample ? "SAMPLE · " : ""}${plain(r.organization)} requests ${money(r.quantity_kg)} kg of ${plain(r.crop)}${r.variety ? ` (${plain(r.variety)})` : ""} in ${plain(r.district)}, ${day(r.available_from)} to ${day(r.deadline)}. ${r.price_ugx_per_kg ? `Proposed UGX ${money(r.price_ugx_per_kg)}/kg` : "Price to agree"}. ${r.grade ? `Requested grade: ${plain(r.grade)}.` : "Grade must be agreed."} ${plain(r.requirements)}`,
            )
            .join("\n\n") +
            "\n\nUse Find buyers to offer matching produce and request a broker introduction. Quantity, transport, grade and final price need agreement.",
          true,
          [
            {
              title:
                "Organization-entered buyer requests; availability must be confirmed",
            },
          ],
        );
      }
      if (!crop)
        return result(
          "Which produce crop or variety? Include the market or district if possible. Prices must retain their original unit, market, date and retail/wholesale basis.",
        );
      // Refresh through the existing bounded, source-validated importer. If unavailable,
      // its durable last successful observations remain usable with their original dates.
      try {
        await marketData.read({ limit: 1 });
      } catch {
        /* Report source unavailability below. */
      }
      const { rows } = await db.query<{ data: Record<string, any> }>(
        `SELECT data FROM market_observations WHERE source_id=$1 AND position(lower($2) in lower(commodity))>0 AND ($3='' OR lower(market)=lower($3) OR lower(data->>'admin2')=lower($3) OR lower(data->>'admin1')=lower($3)) ORDER BY observed_at DESC,market,series_id LIMIT 5`,
        [MARKET_SOURCE.id, crop, district],
      );
      if (!rows.length)
        return result(
          `No published ${crop} reference observations are available${district ? ` for ${district}` : ""}. Check Prices for source coverage or ask your cooperative to confirm a local quote. A price from another market is not silently substituted.`,
        );
      return result(
        rows
          .map(({ data: r }) => {
            const age = Math.max(
              0,
              Math.floor(
                (Date.parse(today) - Date.parse(r.observedAt)) / 86400000,
              ),
            );
            return `${r.commodity}: ${r.currency} ${money(r.price)} per ${r.unit}, ${r.market}, ${r.priceType}. Observation: ${r.period || r.observedAt} (${age} days old${age > 183 ? "; HISTORICAL" : age > 62 ? "; aging" : ""}).`;
          })
          .join("\n\n") +
          "\n\nSource: WFP Uganda Food Prices via HDX, CC BY-IGO 3.0. Monthly reference observations with uneven coverage; these are not today's farm-gate prices or executable seller quotes.",
        true,
        [
          {
            title: MARKET_SOURCE.title,
            url: MARKET_SOURCE.datasetUrl,
            observedAt: rows[0].data.observedAt,
          },
        ],
      );
    },
  };
}

export function mountMarketDesk(
  app: Express,
  desk: ReturnType<typeof createMarketDesk>,
  _config: AppConfig,
) {
  app.post("/api/marketplace/ask", async (req: AuthRequest, res) => {
    res.json(await desk.answer(req.body, req.user!));
  });
}
