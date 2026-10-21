import { describe, expect, it, vi } from "vitest";
import {
  buyerCatalogQuery,
  buyerFlowReducer,
  buyerIntentKey,
  emptyBuyerFilters,
  emptyBuyerFlow,
  mergeBuyerRows,
  previewBuyerTotal,
  validateBuyerOrder,
} from "./buyer-marketplace";
import {
  createSampleBuyerOrder,
  filterSampleBuyerListings,
  sampleBuyerListings,
  submitBuyerRequest,
} from "./buyer-samples";
import type { BuyerOrderInput } from "./buyer-api";

const listing = sampleBuyerListings[0];
const input: BuyerOrderInput = {
  supplyId: listing.id,
  listingVersion: listing.version,
  quantityKg: 100,
  deliveryLocation: "Sample collection point, Kampala",
  requestedDeliveryDate: null,
  message: "Sample quality discussion",
};
const draft = {
  quantityKg: "100",
  deliveryLocation: input.deliveryLocation,
  requestedDeliveryDate: "",
  message: input.message,
};

describe("buyer review and account boundaries", () => {
  it("keeps a guest's selected listing through sign-in without prematurely creating a request", () => {
    let state = buyerFlowReducer(emptyBuyerFlow, {
      type: "select",
      listing,
      authenticated: false,
    });
    expect(state.review).toBeNull();
    expect(state.pending).toBe(listing);
    expect(state.confirmation).toBeNull();
    state = buyerFlowReducer(state, { type: "auth", mode: "login" });
    expect(state.pending).toBe(listing);
    state = buyerFlowReducer(state, { type: "authenticated" });
    expect(state.review).toBe(listing);
    expect(state.auth).toBeNull();
    expect(state.confirmation).toBeNull();
  });
  it("clears private review and confirmation state when an account signs out", () => {
    let state = buyerFlowReducer(emptyBuyerFlow, {
      type: "select",
      listing,
      authenticated: true,
    });
    const order = createSampleBuyerOrder(listing, input, "local-test-request");
    state = buyerFlowReducer(state, { type: "confirmed", order });
    expect(state.confirmation).toBe(order);
    expect(buyerFlowReducer(state, { type: "signed-out" })).toEqual(
      emptyBuyerFlow,
    );
    expect(
      buyerFlowReducer(
        { ...emptyBuyerFlow, pending: listing, auth: "signup" },
        { type: "close" },
      ),
    ).toEqual(emptyBuyerFlow);
  });
  it("only confirms the selected listing and keeps the amount returned by the server", () => {
    const state = buyerFlowReducer(emptyBuyerFlow, {
      type: "select",
      listing,
      authenticated: true,
    });
    const order = {
      ...createSampleBuyerOrder(listing, input, "local-test-request"),
      totalUgx: 147000,
    };
    expect(
      buyerFlowReducer(state, {
        type: "confirmed",
        order: { ...order, supplyId: "another-listing" },
      }),
    ).toBe(state);
    expect(
      buyerFlowReducer(state, { type: "confirmed", order }).confirmation
        ?.totalUgx,
    ).toBe(147000);
    expect(previewBuyerTotal(listing, "100")).toBe(155000);
  });
});

describe("ordering against a published harvest", () => {
  it("rejects fractional, zero, unsafe and oversubscribed quantities before a request", () => {
    for (const quantityKg of [
      "0",
      "-1",
      "1.5",
      "6001",
      "9007199254740993",
      "not-a-number",
    ])
      expect(
        validateBuyerOrder(listing, { ...draft, quantityKg }, "2026-10-21"),
      ).not.toBe("");
    expect(
      validateBuyerOrder(
        listing,
        { ...draft, quantityKg: "6000" },
        "2026-10-21",
      ),
    ).toBe("");
    expect(
      validateBuyerOrder(
        { ...listing, harvestFrom: "2026-11-01" },
        { ...draft, requestedDeliveryDate: "2026-10-25" },
        "2026-10-21",
      ),
    ).toContain("harvest begins");
    expect(previewBuyerTotal(listing, "6001")).toBeNull();
  });
  it("does not treat a missing price as free produce or create an order", () => {
    const quoteOnly = sampleBuyerListings[2];
    expect(previewBuyerTotal(quoteOnly, "100")).toBeNull();
    expect(validateBuyerOrder(quoteOnly, draft, "2026-10-21")).toContain(
      "confirmed price",
    );
    expect(() =>
      createSampleBuyerOrder(quoteOnly, { ...input, supplyId: quoteOnly.id }),
    ).toThrow();
  });
  it("validates real calendar dates and future delivery requests without inventing a promise", () => {
    for (const requestedDeliveryDate of [
      "2026-02-30",
      "2026-13-01",
      "2026-10-20",
      "soon",
    ])
      expect(
        validateBuyerOrder(
          listing,
          { ...draft, requestedDeliveryDate },
          "2026-10-21",
        ),
      ).not.toBe("");
    expect(
      validateBuyerOrder(
        listing,
        { ...draft, requestedDeliveryDate: "2026-10-21" },
        "2026-10-21",
      ),
    ).toBe("");
    expect(
      validateBuyerOrder(
        listing,
        { ...draft, deliveryLocation: " " },
        "2026-10-21",
      ),
    ).not.toBe("");
  });
  it("sends all filters to the server before pagination and safely encodes search text", () => {
    const query = buyerCatalogQuery(
      {
        q: "Beans & coffee",
        crop: "Beans",
        district: "Kampala",
        minQuantityKg: "500",
      },
      24,
    );
    expect(query.get("q")).toBe("Beans & coffee");
    expect(query.get("crop")).toBe("Beans");
    expect(query.get("district")).toBe("Kampala");
    expect(query.get("minQuantityKg")).toBe("500");
    expect(query.get("offset")).toBe("24");
    expect(buyerCatalogQuery(emptyBuyerFilters).has("crop")).toBe(false);
  });
  it("updates existing stock when merging pages rather than duplicating stale cards", () => {
    const updated = { ...listing, version: 2, availableQuantityKg: 4500 };
    const result = mergeBuyerRows([listing], [updated, sampleBuyerListings[1]]);
    expect(result).toHaveLength(2);
    expect(result[0].availableQuantityKg).toBe(4500);
    expect(result[0].version).toBe(2);
  });
  it("reuses an intent key after an unknown network outcome, and changes it for a different buyer, version or quantity", () => {
    const keys = new Map<string, string>();
    let sequence = 0;
    const uuid = () => `key-${++sequence}`;
    const first = buyerIntentKey(keys, "buyer-one", input, uuid);
    expect(buyerIntentKey(keys, "buyer-one", input, uuid)).toBe(first);
    expect(buyerIntentKey(keys, "buyer-two", input, uuid)).not.toBe(first);
    expect(
      buyerIntentKey(keys, "buyer-one", { ...input, listingVersion: 2 }, uuid),
    ).not.toBe(first);
    expect(
      buyerIntentKey(keys, "buyer-one", { ...input, quantityKg: 101 }, uuid),
    ).not.toBe(first);
  });
});

describe("browser-only sample marketplace", () => {
  it("never calls the real mutation while simulating a request", async () => {
    const live = vi
      .fn()
      .mockRejectedValue(new Error("must not contact the API"));
    const order = await submitBuyerRequest(true, listing, input, live);
    expect(live).not.toHaveBeenCalled();
    expect(order.sample).toBe(true);
    expect(order.status).toBe("requested");
    expect(order.totalUgx).toBe(155000);
    expect(order.id).toMatch(/^sample-request-/);
  });
  it("uses only the real response in live mode and does not substitute local success on failure", async () => {
    const serverOrder = {
      ...createSampleBuyerOrder(listing, input, "server-test-id"),
      sample: false,
      totalUgx: 147000,
    };
    const live = vi.fn().mockResolvedValue(serverOrder);
    expect(await submitBuyerRequest(false, listing, input, live)).toBe(
      serverOrder,
    );
    const rejected = vi.fn().mockRejectedValue(new Error("Listing changed"));
    await expect(
      submitBuyerRequest(false, listing, input, rejected),
    ).rejects.toThrow("Listing changed");
  });
  it("filters fictional inventory without broadening a user's minimum stock or district", () => {
    expect(
      filterSampleBuyerListings({
        ...emptyBuyerFilters,
        minQuantityKg: "1500",
      }),
    ).toEqual([listing]);
    expect(
      filterSampleBuyerListings({
        ...emptyBuyerFilters,
        q: "Nambale",
        district: "Mpigi",
      }),
    ).toEqual([sampleBuyerListings[1]]);
    expect(
      filterSampleBuyerListings({
        ...emptyBuyerFilters,
        crop: "Beans",
        district: "Nakaseke",
      }),
    ).toEqual([]);
  });
  it("refuses non-preview inventory, stale sample versions and excess quantities in the local simulator", () => {
    expect(() =>
      createSampleBuyerOrder(
        { ...listing, id: "live-supply", sample: false },
        input,
      ),
    ).toThrow();
    expect(() =>
      createSampleBuyerOrder(listing, { ...input, listingVersion: 2 }),
    ).toThrow();
    expect(() =>
      createSampleBuyerOrder(listing, { ...input, quantityKg: 6001 }),
    ).toThrow();
  });
});
