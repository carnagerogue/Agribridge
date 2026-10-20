import type {
  BuyerDemand,
  MarketServiceQuote,
  SupplyListing,
} from "../../server/marketplace-types";

export const marketCategories = [
  { value: "all", label: "All services" },
  { value: "input", label: "Farm inputs" },
  { value: "transport", label: "Transport" },
  { value: "storage", label: "Storage" },
] as const;

export type ServiceCategory = (typeof marketCategories)[number]["value"];

const marketDateFormat = new Intl.DateTimeFormat("en-UG", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

export function marketDate(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return "Not recorded";
  return marketDateFormat.format(new Date(value));
}

export function matchesMarketSearch(query: string, ...values: unknown[]) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = values.filter(Boolean).join(" ").toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function serviceSearch(quote: MarketServiceQuote, query: string) {
  return matchesMarketSearch(
    query,
    quote.name,
    quote.provider,
    quote.district,
    quote.community,
    quote.crop,
    quote.category,
  );
}

export function supplySearch(supply: SupplyListing, query: string) {
  return matchesMarketSearch(
    query,
    supply.crop,
    supply.variety,
    supply.district,
    supply.community,
    supply.grade,
  );
}

export function demandSearch(demand: BuyerDemand, query: string) {
  return matchesMarketSearch(
    query,
    demand.crop,
    demand.variety,
    demand.organization,
    demand.district,
    demand.grade,
  );
}

export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "This could not be completed. Please try again.";
}

export function daysFromToday(offset: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function safeMarketSource(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
