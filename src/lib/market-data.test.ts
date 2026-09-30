import { describe, expect, it } from "vitest";
import {
  emptyMarketFilters,
  fromUgandaDateInput,
  marketArea,
  marketDataPath,
  marketDate,
  marketSourceLink,
  marketViewIsStale,
  observationFreshness,
  parsePublishedMarketData,
  publishedPriceLabel,
  reportingMonth,
  secondaryMarketFilterCount,
  marketFiltersEqual,
  marketFilterDescription,
  shouldReadMarketView,
  toUgandaDateInput,
  type PublishedMarketData,
  type PublishedPrice,
} from "./market-data";

describe("deliberate low-bandwidth price search", () => {
  it("keeps a draft selection separate from the applied request and description", () => {
    const applied = {
      ...emptyMarketFilters,
      commodity: "Beans",
      market: "Owino",
    };
    const draft = { ...applied, commodity: "Maize", market: "Adjumani" };
    expect(marketFiltersEqual(draft, applied)).toBe(false);
    expect(marketDataPath(applied)).toContain("commodity=Beans");
    expect(marketDataPath(applied)).toContain("market=Owino");
    expect(marketFilterDescription(applied)).toBe("Beans · Owino");
    const committed = { ...draft };
    expect(marketFiltersEqual(committed, draft)).toBe(true);
    expect(marketDataPath(committed)).toContain("commodity=Maize");
  });
  it("detects changes to every supported filter and describes their applied values", () => {
    for (const key of Object.keys(emptyMarketFilters)) {
      expect(
        marketFiltersEqual(emptyMarketFilters, {
          ...emptyMarketFilters,
          [key]: "changed",
        }),
      ).toBe(false);
    }
    expect(
      marketFilterDescription({
        ...emptyMarketFilters,
        priceType: "Wholesale",
        unit: "KG",
        currency: "UGX",
        category: "cereals and tubers",
      }),
    ).toBe(
      "All crops and items · All markets · Wholesale · KG · UGX · cereals and tubers",
    );
  });
  it("does not fetch a hidden or offline view, even after reconnection was requested", () => {
    const state = {
      visible: true,
      online: true,
      path: "/query",
      loadedPath: null,
      reconnect: true,
    };
    expect(shouldReadMarketView({ ...state, visible: false })).toBe(false);
    expect(shouldReadMarketView({ ...state, online: false })).toBe(false);
  });
  it("reuses the same in-memory query across views and reads new or reconnected queries", () => {
    const state = {
      visible: true,
      online: true,
      path: "/query",
      loadedPath: "/query",
      reconnect: false,
    };
    expect(shouldReadMarketView(state)).toBe(false);
    expect(shouldReadMarketView({ ...state, loadedPath: null })).toBe(true);
    expect(shouldReadMarketView({ ...state, path: "/different-query" })).toBe(
      true,
    );
    expect(shouldReadMarketView({ ...state, reconnect: true })).toBe(true);
  });
});

const row: PublishedPrice = {
  id: "source-series",
  commodity: "Maize",
  commodityId: "68",
  category: "cereals and tubers",
  market: "A reported market",
  marketId: "1",
  admin1: "Source area",
  admin2: "",
  latitude: null,
  longitude: null,
  observedAt: "2026-04-15",
  period: "2026-04",
  ageDays: 167,
  freshness: "aging",
  unit: "KG",
  currency: "UGX",
  priceType: "Retail",
  priceFlag: "actual",
  price: 1500.25,
  usdPrice: null,
  rowHash: "hash",
};
const fixture: PublishedMarketData = {
  status: "available",
  cacheStatus: "fresh",
  refreshState: "idle",
  total: 1,
  nextCursor: null,
  items: [row],
  source: {
    id: "wfp-uganda-food-prices",
    title: "Uganda — WFP Food Prices",
    publisher: "World Food Programme (WFP), via HDX",
    datasetUrl: "https://data.humdata.org/dataset/wfp-food-prices-for-uganda",
    downloadUrl: "https://data.humdata.org/dataset/test/download.csv",
    license: {
      name: "CC BY-IGO 3.0",
      url: "https://creativecommons.org/licenses/by/3.0/igo/",
    },
    frequency: "monthly",
    retrievedAt: "2026-09-29T08:00:00Z",
    sourceUpdatedAt: "2026-08-15T00:00:00Z",
    latestObservationAt: "2026-08-15",
    sourceHash: "hash",
    recordCount: 100,
    seriesCount: 10,
    marketCount: 3,
    commodityCount: 2,
    lastAttemptAt: "2026-09-29T08:00:00Z",
    nextRefreshAt: "2026-09-30T08:00:00Z",
    lastError: null,
  },
  filters: {
    commodities: ["Maize"],
    categories: ["cereals and tubers"],
    markets: ["A reported market"],
    priceTypes: ["Retail"],
    units: ["KG"],
    currencies: ["UGX"],
  },
};

describe("published market presentation", () => {
  it("counts selected secondary filters without hiding active commodity and market selections", () => {
    expect(
      secondaryMarketFilterCount({
        ...emptyMarketFilters,
        commodity: "Beans",
        market: "Owino",
      }),
    ).toBe(0);
    expect(
      secondaryMarketFilterCount({
        ...emptyMarketFilters,
        category: "pulses and nuts",
        priceType: "Wholesale",
        unit: "KG",
        currency: "UGX",
      }),
    ).toBe(4);
  });
  it("keeps exact currencies and denominators without converting bags, kilograms, or dollars", () => {
    expect(publishedPriceLabel(row)).toBe("UGX 1,500.25 / KG");
    expect(publishedPriceLabel({ ...row, unit: "100 KG" })).toBe(
      "UGX 1,500.25 / 100 KG",
    );
    expect(
      publishedPriceLabel({ ...row, unit: "L", currency: "USD", price: 2.5 }),
    ).toBe("USD 2.5 / L");
  });

  it("shows the row's reporting month, not the newer download or newest source-wide period", () => {
    expect(reportingMonth(row.period)).toBe("April 2026");
    expect(reportingMonth(fixture.source.latestObservationAt)).toBe(
      "August 2026",
    );
    expect(marketDate(fixture.source.retrievedAt)).toContain("2026");
    expect(reportingMonth("2026-13")).toBe("Not supplied");
    expect(reportingMonth(null)).toBe("Not supplied");
  });

  it("labels source historical age and does not invent district coverage", () => {
    expect(
      observationFreshness({ freshness: "historical", ageDays: 1500 }),
    ).toBe("Historical · 1500 days old");
    expect(marketArea(row)).toBe("Source area");
    expect(marketArea({ admin1: "", admin2: "" })).toBe(
      "Area not supplied by source",
    );
    expect(marketArea({ admin1: "District", admin2: "District" })).toBe(
      "District",
    );
  });

  it("marks source fallback, failed refresh, and offline memory as cached instead of current", () => {
    expect(marketViewIsStale(fixture, false, true)).toBe(false);
    expect(marketViewIsStale(fixture, true, true)).toBe(true);
    expect(marketViewIsStale(fixture, false, false)).toBe(true);
    expect(
      marketViewIsStale({ ...fixture, cacheStatus: "stale" }, false, true),
    ).toBe(true);
  });

  it("uses exact bounded server filters and safely encodes opaque cursors", () => {
    const url = new URL(
      marketDataPath(
        {
          ...emptyMarketFilters,
          commodity: "Beans (dry)",
          category: "pulses and nuts",
          priceType: "Wholesale",
          unit: "100 KG",
          currency: "UGX",
        },
        "page+/=",
      ),
      "https://app.example",
    );
    expect(url.searchParams.get("commodity")).toBe("Beans (dry)");
    expect(url.searchParams.get("category")).toBe("pulses and nuts");
    expect(url.searchParams.get("priceType")).toBe("Wholesale");
    expect(url.searchParams.get("unit")).toBe("100 KG");
    expect(url.searchParams.get("cursor")).toBe("page+/=");
    expect(url.searchParams.get("limit")).toBe("30");
    expect(url.searchParams.has("market")).toBe(false);
  });

  it("accepts honest unavailable responses and never silently fills missing data with sample rows", () => {
    expect(parsePublishedMarketData(fixture)).toBe(fixture);
    expect(
      parsePublishedMarketData({
        ...fixture,
        status: "unavailable",
        cacheStatus: "empty",
        items: [],
        total: 0,
      }).items,
    ).toEqual([]);
    expect(() =>
      parsePublishedMarketData({ ...fixture, status: "unavailable" }),
    ).toThrow();
    expect(() =>
      parsePublishedMarketData({
        ...fixture,
        items: [{ ...row, sample: true }],
      }),
    ).toThrow();
    expect(() =>
      parsePublishedMarketData({ ...fixture, items: [{ ...row, unit: "" }] }),
    ).toThrow();
    expect(() =>
      parsePublishedMarketData({ ...fixture, items: [{ ...row, price: NaN }] }),
    ).toThrow();
  });

  it("limits source links to HTTPS publisher/attribution domains", () => {
    expect(marketSourceLink(fixture.source.datasetUrl)).toBe(
      fixture.source.datasetUrl,
    );
    expect(marketSourceLink(fixture.source.license.url)).toBe(
      fixture.source.license.url,
    );
    for (const url of [
      "javascript:alert(1)",
      "https://data.humdata.org.evil.test/",
      "https://evil.test/",
      "https://user:pass@data.humdata.org/",
    ])
      expect(marketSourceLink(url)).toBeNull();
  });

  it("records manual quotes in Uganda time regardless of browser timezone", () => {
    expect(toUgandaDateInput("2026-09-29T00:30:00Z")).toBe("2026-09-29T03:30");
    expect(fromUgandaDateInput("2026-09-29T03:30")).toBe(
      "2026-09-29T00:30:00.000Z",
    );
    expect(() => fromUgandaDateInput("2026-02-30T03:30")).toThrow();
  });
});
