export interface PublishedPrice {
  id: string;
  commodity: string;
  commodityId: string;
  category: string;
  market: string;
  marketId: string;
  admin1: string;
  admin2: string;
  latitude: number | null;
  longitude: number | null;
  observedAt: string;
  period: string;
  ageDays: number;
  freshness: "recent" | "aging" | "historical";
  unit: string;
  currency: string;
  priceType: string;
  priceFlag: string;
  price: number;
  usdPrice: number | null;
  rowHash: string;
}
export interface MarketSource {
  id: string;
  title: string;
  publisher: string;
  datasetUrl: string;
  downloadUrl: string;
  license: { name: string; url: string };
  frequency: "monthly";
  retrievedAt: string | null;
  sourceUpdatedAt: string | null;
  latestObservationAt: string | null;
  sourceHash: string | null;
  recordCount: number;
  seriesCount: number;
  marketCount: number;
  commodityCount: number;
  lastAttemptAt: string | null;
  nextRefreshAt: string | null;
  lastError: string | null;
}
export interface PublishedMarketData {
  status: "available" | "unavailable";
  cacheStatus: "fresh" | "stale" | "empty";
  refreshState: "idle" | "running" | "backoff";
  source: MarketSource;
  items: PublishedPrice[];
  filters: {
    commodities: string[];
    categories: string[];
    markets: string[];
    priceTypes: string[];
    units: string[];
    currencies: string[];
  };
  total: number;
  nextCursor: string | null;
}
export interface MarketFilters {
  commodity: string;
  category: string;
  market: string;
  priceType: string;
  unit: string;
  currency: string;
}
export const emptyMarketFilters: MarketFilters = {
  commodity: "",
  category: "",
  market: "",
  priceType: "",
  unit: "",
  currency: "",
};

export function secondaryMarketFilterCount(filters: MarketFilters): number {
  return (["category", "priceType", "unit", "currency"] as const).filter(
    (key) => Boolean(filters[key]),
  ).length;
}

/** Draft controls do not change the applied request until the user submits. */
export function marketFiltersEqual(
  left: MarketFilters,
  right: MarketFilters,
): boolean {
  return (Object.keys(emptyMarketFilters) as Array<keyof MarketFilters>).every(
    (key) => left[key] === right[key],
  );
}

/** Labels always describe applied filters, never an unsent draft. */
export function marketFilterDescription(filters: MarketFilters): string {
  return [
    filters.commodity || "All crops and items",
    filters.market || "All markets",
    filters.priceType,
    filters.unit,
    filters.currency,
    filters.category,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function shouldReadMarketView(input: {
  visible: boolean;
  online: boolean;
  path: string;
  loadedPath: string | null;
  reconnect: boolean;
}): boolean {
  return (
    input.visible &&
    input.online &&
    (input.reconnect || input.path !== input.loadedPath)
  );
}

export function marketDataPath(
  filters: MarketFilters,
  cursor: string | null = null,
): string {
  const query = new URLSearchParams({ limit: "30" });
  for (const key of [
    "commodity",
    "category",
    "market",
    "priceType",
    "unit",
    "currency",
  ] as const)
    if (filters[key]) query.set(key, filters[key]);
  if (cursor) query.set("cursor", cursor);
  return `/api/market-data?${query}`;
}

/** Source values keep their original denominator and price type. No bag/kg conversion. */
export function publishedPriceLabel(
  row: Pick<PublishedPrice, "currency" | "price" | "unit">,
): string {
  return `${row.currency} ${new Intl.NumberFormat("en-UG", { maximumFractionDigits: 2 }).format(row.price)} / ${row.unit}`;
}

export function reportingMonth(value: string | null | undefined): string {
  const period = value?.slice(0, 7) ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return "Not supplied";
  return new Intl.DateTimeFormat("en-UG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period}-01T00:00:00Z`));
}

export function marketDate(
  value: string | null | undefined,
  withTime = false,
): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not supplied";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Kampala",
    ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  }).format(new Date(value));
}

export function marketArea(
  row: Pick<PublishedPrice, "admin1" | "admin2">,
): string {
  return (
    [...new Set([row.admin2, row.admin1].filter(Boolean))].join(" · ") ||
    "Area not supplied by source"
  );
}

export function marketSourceLink(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !["humdata.org", "wfp.org", "creativecommons.org"].some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export function observationFreshness(
  row: Pick<PublishedPrice, "freshness" | "ageDays">,
): string {
  return row.freshness === "historical"
    ? `Historical · ${row.ageDays} days old`
    : row.freshness === "aging"
      ? `Older period · ${row.ageDays} days old`
      : `${row.ageDays} days since observation date`;
}

export function marketViewIsStale(
  data: PublishedMarketData,
  readFailed: boolean,
  online: boolean,
): boolean {
  return data.cacheStatus === "stale" || readFailed || !online;
}

/** A successful HTTP response must still contain source-backed, unit-qualified rows. */
export function parsePublishedMarketData(value: unknown): PublishedMarketData {
  if (!value || typeof value !== "object")
    throw new Error(
      "Published market data is unavailable. The response could not be verified.",
    );
  const data = value as PublishedMarketData;
  const fail = () => {
    throw new Error(
      "Published market data is unavailable. The response could not be verified.",
    );
  };
  if (
    !["available", "unavailable"].includes(data.status) ||
    !["fresh", "stale", "empty"].includes(data.cacheStatus) ||
    !["idle", "running", "backoff"].includes(data.refreshState)
  )
    fail();
  if (
    !data.source ||
    typeof data.source.title !== "string" ||
    typeof data.source.publisher !== "string" ||
    data.source.frequency !== "monthly" ||
    !marketSourceLink(data.source.datasetUrl) ||
    !data.source.license ||
    typeof data.source.license.name !== "string"
  )
    fail();
  if (
    !Array.isArray(data.items) ||
    data.items.length > 100 ||
    !Number.isFinite(data.total) ||
    data.total < 0 ||
    (data.nextCursor !== null && typeof data.nextCursor !== "string")
  )
    fail();
  if (data.status === "unavailable" && (data.items.length || data.total))
    fail();
  for (const item of data.items) {
    if (
      !item ||
      [
        item.id,
        item.commodity,
        item.market,
        item.currency,
        item.unit,
        item.priceType,
        item.priceFlag,
      ].some((field) => typeof field !== "string" || !field.length) ||
      typeof item.admin1 !== "string" ||
      typeof item.admin2 !== "string" ||
      !Number.isFinite(item.price) ||
      item.price < 0 ||
      !Number.isFinite(item.ageDays) ||
      item.ageDays < 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.observedAt) ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.period) ||
      !["recent", "aging", "historical"].includes(item.freshness) ||
      (item as unknown as { sample?: boolean }).sample === true
    )
      fail();
  }
  for (const key of [
    "commodities",
    "categories",
    "markets",
    "priceTypes",
    "units",
    "currencies",
  ] as const)
    if (
      !Array.isArray(data.filters?.[key]) ||
      data.filters[key].length > 5000 ||
      data.filters[key].some(
        (item) => typeof item !== "string" || item.length > 300,
      )
    )
      fail();
  return data;
}

/** Manual observations always use Uganda time, independent of the operator's browser timezone. */
export function toUgandaDateInput(value = new Date().toISOString()): string {
  return new Date(Date.parse(value) + 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
export function fromUgandaDateInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a valid observation date and time.");
  const parsed = new Date(`${value}:00+03:00`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    toUgandaDateInput(parsed.toISOString()) !== value
  )
    throw new Error("Enter a valid observation date and time.");
  return parsed.toISOString();
}
