import type { Season } from "../types";

export function seasonNumbers(
  season: Pick<
    Season,
    | "costs"
    | "contingencyUgx"
    | "expectedHarvestKg"
    | "reserveKg"
    | "expectedPriceUgx"
    | "sales"
  >,
) {
  const plannedCost =
    season.costs.reduce((sum, cost) => sum + cost.plannedUgx, 0) +
    season.contingencyUgx;
  const actualCost = season.costs.reduce(
    (sum, cost) => sum + (cost.actualUgx ?? 0),
    0,
  );
  const saleableKg = Math.max(0, season.expectedHarvestKg - season.reserveKg);
  const revenue = Math.round(saleableKg * season.expectedPriceUgx);
  const salesValue = season.sales.reduce(
    (sum, sale) => sum + Math.round(sale.quantityKg * sale.unitPriceUgx),
    0,
  );
  const received = season.sales.reduce(
    (sum, sale) => sum + sale.receivedUgx,
    0,
  );
  const soldKg = season.sales.reduce((sum, sale) => sum + sale.quantityKg, 0);
  return {
    plannedCost,
    actualCost,
    saleableKg,
    revenue,
    margin: revenue - plannedCost,
    breakEven: saleableKg > 0 ? Math.ceil(plannedCost / saleableKg) : null,
    downside:
      Math.max(0, season.expectedHarvestKg * 0.8 - season.reserveKg) *
        season.expectedPriceUgx *
        0.8 -
      plannedCost,
    salesValue,
    received,
    outstanding: salesValue - received,
    cashBalance: received - actualCost,
    soldKg,
  };
}
