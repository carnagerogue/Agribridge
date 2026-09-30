import { describe, expect, it } from "vitest";
import { collectionLotRows, eligibleLots } from "./Harvest";
import type { Collection, HarvestLot } from "../types";

const lot = (id: string, overrides: Partial<HarvestLot> = {}): HarvestLot => ({
  id,
  version: 1,
  createdAt: "",
  updatedAt: "",
  farmId: "farm",
  crop: "Maize",
  harvestDate: "2026-09-01",
  quantityKg: 500,
  bagCount: 10,
  storageLocation: "Store A",
  moisturePercent: null,
  measurementMethod: "not_recorded",
  testReference: "",
  qualityStatus: "accepted",
  qualityNotes: "Internal review only",
  notes: "",
  lotCode: `AG-${id}`,
  allocation: null,
  ...overrides,
});

describe("harvest collection eligibility", () => {
  it("offers only accepted, same-crop, unallocated lots", () => {
    const lots = [
      lot("ready"),
      lot("wrong-crop", { crop: "Coffee" }),
      lot("waiting", { qualityStatus: "pending_test" }),
      lot("held", { qualityStatus: "on_hold" }),
      lot("other-buyer", {
        allocation: { collectionId: "other", status: "planning" },
      }),
      lot("dispatched", {
        allocation: { collectionId: "done", status: "dispatched" },
      }),
    ];
    expect(eligibleLots(lots, "  MAIZE ").map((item) => item.id)).toEqual([
      "ready",
    ]);
  });

  it("keeps the collection’s existing allocation available while editing", () => {
    const lots = [
      lot("own", {
        allocation: { collectionId: "current", status: "planning" },
      }),
      lot("other", {
        allocation: { collectionId: "other", status: "confirmed" },
      }),
    ];
    expect(
      eligibleLots(lots, "Maize", "current").map((item) => item.id),
    ).toEqual(["own"]);
  });

  it("does not mutate the received inventory", () => {
    const lots = [lot("ready")];
    const before = structuredClone(lots);
    eligibleLots(lots, "Maize");
    expect(lots).toEqual(before);
  });
});

describe("collection traceability", () => {
  it("shows the frozen manifest when a released lot has changed", () => {
    const collection = {
      lotIds: ["released"],
      status: "cancelled",
      manifest: [
        { lotId: "released", lotCode: "AG-ORIGINAL", quantityKg: 500 },
      ],
    } as Collection;
    const rows = collectionLotRows(collection, [
      lot("released", { quantityKg: 750 }),
    ]);
    expect(rows).toEqual([
      { id: "released", code: "AG-ORIGINAL", quantityKg: 500, farmId: "farm" },
    ]);
  });

  it("uses an explicit missing state when no manifest or current lot exists", () => {
    const collection = { lotIds: ["missing"] } as Collection;
    expect(collectionLotRows(collection, [])).toEqual([
      {
        id: "missing",
        code: "Lot record",
        quantityKg: null,
        farmId: undefined,
      },
    ]);
  });
});
