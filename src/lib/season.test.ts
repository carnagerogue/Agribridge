import { describe, expect, it } from "vitest";
import { seasonNumbers } from "./season";

describe("season planning arithmetic", () => {
  const example = {
    costs: [
      {
        id: "seed",
        category: "seed" as const,
        label: "Seed",
        plannedUgx: 100000,
        actualUgx: 90000,
      },
    ],
    contingencyUgx: 20000,
    expectedHarvestKg: 1000,
    reserveKg: 200,
    expectedPriceUgx: 500,
    sales: [
      {
        id: "sale",
        date: "2026-09-29",
        buyer: "Test",
        quantityKg: 100,
        unitPriceUgx: 500,
        receivedUgx: 40000,
      },
    ],
  };
  it("separates household reserve, planned margin, recorded cash and receivables", () => {
    expect(seasonNumbers(example)).toEqual({
      plannedCost: 120000,
      actualCost: 90000,
      saleableKg: 800,
      revenue: 400000,
      margin: 280000,
      breakEven: 150,
      downside: 120000,
      salesValue: 50000,
      received: 40000,
      outstanding: 10000,
      cashBalance: -50000,
      soldKg: 100,
    });
  });
  it("never divides by zero or treats reserves as produce for sale", () => {
    const result = seasonNumbers({ ...example, reserveKg: 1000 });
    expect(result.breakEven).toBeNull();
    expect(result.revenue).toBe(0);
    expect(result.downside).toBe(-120000);
  });
});
