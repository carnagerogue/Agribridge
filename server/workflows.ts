import { randomUUID } from "node:crypto";
import type { Queryable } from "./db.js";
import { ApiError, type User } from "./security.js";
import { schemas, type EntityType } from "./schemas.js";
import { findEntity, type EntityRow } from "./store.js";

type RecordData = Record<string, any>;
const invalid = (message: string) =>
  new ApiError(400, "INVALID_WORKFLOW", message);
const equalCrop = (first: string, second: string) =>
  first.trim().toLocaleLowerCase() === second.trim().toLocaleLowerCase();
const moneyTotal = (value: number) => {
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || Math.abs(rounded) > 100_000_000_000_000)
    throw invalid("The monetary total exceeds the supported range.");
  return rounded;
};
const distinct = (values: string[]) => new Set(values).size === values.length;

/** Domain dates follow the farmer's Uganda calendar; audit timestamps remain UTC. */
export function ugandaCalendarDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function seasonSummary(data: RecordData) {
  const plannedCostUgx = moneyTotal(
    data.costs.reduce((sum: number, cost: any) => sum + cost.plannedUgx, 0) +
      data.contingencyUgx,
  );
  const actualCostUgx = moneyTotal(
    data.costs.reduce(
      (sum: number, cost: any) => sum + (cost.actualUgx ?? 0),
      0,
    ),
  );
  const unrecordedCostCount = data.costs.filter(
    (cost: any) => cost.actualUgx === null,
  ).length;
  const marketableKg = data.expectedHarvestKg - data.reserveKg;
  const plannedRevenueUgx = moneyTotal(marketableKg * data.expectedPriceUgx);
  const salesValueUgx = moneyTotal(
    data.sales.reduce(
      (sum: number, sale: any) =>
        sum + moneyTotal(sale.quantityKg * sale.unitPriceUgx),
      0,
    ),
  );
  const receivedUgx = moneyTotal(
    data.sales.reduce((sum: number, sale: any) => sum + sale.receivedUgx, 0),
  );
  return {
    plannedCostUgx,
    actualCostUgx,
    marketableKg,
    plannedRevenueUgx,
    plannedCashMarginUgx: moneyTotal(plannedRevenueUgx - plannedCostUgx),
    breakEvenPriceUgx:
      marketableKg > 0 ? Math.ceil(plannedCostUgx / marketableKg) : null,
    soldKg: data.sales.reduce(
      (sum: number, sale: any) => sum + sale.quantityKg,
      0,
    ),
    salesValueUgx,
    receivedUgx,
    recordedCashBalanceUgx: moneyTotal(receivedUgx - actualCostUgx),
    actualCostRecords: data.costs.length - unrecordedCostCount,
    unrecordedCostCount,
    hasUnrecordedActualCosts: unrecordedCostCount > 0,
  };
}

export async function prepareWorkflow(
  db: Queryable,
  user: User,
  type: EntityType,
  input: RecordData,
  old?: EntityRow,
): Promise<RecordData> {
  if (!["seasons", "lots", "collections"].includes(type)) return input;
  const schema = schemas[type];
  const merged = { ...old?.data, ...input };
  const data = schema.parse(
    Object.fromEntries(
      Object.keys(schema.shape)
        .filter((key) => Object.hasOwn(merged, key))
        .map((key) => [key, merged[key]]),
    ),
  ) as RecordData;
  if (type === "seasons") {
    if (old && data.farmId !== old.data.farmId)
      throw invalid(
        "A season stays linked to its original farm. Create another season to use a different farm.",
      );
    await findEntity(db, user, "farms", data.farmId);
    if (data.plantingDate > data.expectedHarvestDate)
      throw invalid("Expected harvest must be on or after the planting date.");
    if (data.reserveKg > data.expectedHarvestKg)
      throw invalid("Household reserve cannot exceed the expected harvest.");
    if (
      !distinct(data.costs.map((cost: any) => cost.id)) ||
      !distinct(data.sales.map((sale: any) => sale.id))
    )
      throw invalid("Cost and sale entry references must be unique.");
    if (
      data.sales.some(
        (sale: any) =>
          sale.receivedUgx > moneyTotal(sale.quantityKg * sale.unitPriceUgx),
      )
    )
      throw invalid("A sale receipt cannot exceed that sale’s recorded value.");
    const summary = seasonSummary(data);
    if (summary.soldKg > data.harvestedKg + 0.000001)
      throw invalid(
        "Record enough harvested quantity before recording these sales.",
      );
    if (old) {
      const linked = await db.query<{ total: number; count: number }>(
        `SELECT COALESCE(sum((data->>'quantityKg')::numeric),0)::float AS total,count(*)::integer AS count FROM entities WHERE tenant_id=$1 AND type='lots' AND data->>'seasonId'=$2`,
        [user.organizationId, old.id],
      );
      if (data.harvestedKg + 0.000001 < linked.rows[0].total)
        throw invalid(
          "Recorded harvest cannot be less than the quantity already recorded in linked lots.",
        );
      if (linked.rows[0].count > 0 && !equalCrop(data.crop, old.data.crop))
        throw invalid(
          "The crop cannot change after harvest lots are linked to this season.",
        );
    }
    return data;
  }
  if (type === "lots") {
    if (old && data.farmId !== old.data.farmId)
      throw invalid("A harvest lot stays linked to its original farm.");
    const farm = await findEntity(db, user, "farms", data.farmId);
    if (data.seasonId) {
      const season = await findEntity(db, user, "seasons", data.seasonId, true);
      if (
        season.data.farmId !== data.farmId ||
        season.owner_id !== farm.owner_id
      )
        throw invalid("Choose a season from this lot’s farm.");
      if (!equalCrop(data.crop, season.data.crop))
        throw invalid("The crop must match the linked season.");
      const linked = await db.query<{ total: number }>(
        `SELECT COALESCE(sum((data->>'quantityKg')::numeric),0)::float AS total FROM entities WHERE tenant_id=$1 AND type='lots' AND data->>'seasonId'=$2 AND id<>$3`,
        [user.organizationId, data.seasonId, old?.id || ""],
      );
      if (
        linked.rows[0].total + data.quantityKg >
        season.data.harvestedKg + 0.000001
      )
        throw invalid(
          "Lot quantities cannot exceed the linked season’s recorded harvest.",
        );
    }
    if (data.harvestDate > ugandaCalendarDay())
      throw invalid("An actual harvest date cannot be in the future.");
    if (
      data.moisturePercent !== null &&
      data.measurementMethod === "not_recorded"
    )
      throw invalid("Record how the moisture reading was measured.");
    if (data.measurementMethod === "not_recorded" && data.testReference)
      throw invalid("Choose a measurement method for the test reference.");
    if (old) {
      const allocated = await db.query(
        `SELECT lot_id FROM lot_allocations WHERE tenant_id=$1 AND lot_id=$2`,
        [user.organizationId, old.id],
      );
      if (allocated.rows.length)
        throw new ApiError(
          409,
          "LOT_ALLOCATED",
          "This lot is allocated. Remove it from the collection before editing; dispatched lots remain locked.",
        );
    }
    const restricted = ["accepted", "on_hold", "rejected"];
    if (
      user.role === "farmer" &&
      restricted.includes(data.qualityStatus) &&
      data.qualityStatus !== old?.data.qualityStatus
    )
      throw new ApiError(
        403,
        "FORBIDDEN",
        "An operator must record the quality review.",
      );
    const material = [
      "crop",
      "seasonId",
      "harvestDate",
      "quantityKg",
      "bagCount",
      "storageLocation",
      "moisturePercent",
      "measurementMethod",
      "testReference",
    ];
    const materialChanged = Boolean(
      old &&
      material.some(
        (key) => JSON.stringify(data[key]) !== JSON.stringify(old.data[key]),
      ),
    );
    const explicitReview =
      user.role !== "farmer" &&
      Object.hasOwn(input, "qualityStatus") &&
      restricted.includes(input.qualityStatus);
    if (materialChanged && !explicitReview) data.qualityStatus = "unassessed";
    if (
      user.role === "farmer" &&
      restricted.includes(data.qualityStatus) &&
      Object.hasOwn(input, "qualityStatus")
    )
      throw new ApiError(
        403,
        "FORBIDDEN",
        "An operator must record the quality review.",
      );
    if (explicitReview && data.qualityNotes.trim().length < 10)
      throw invalid(
        "Describe the quality review and its limits in at least 10 characters.",
      );
    const preserve =
      old &&
      !materialChanged &&
      !explicitReview &&
      data.qualityStatus === old.data.qualityStatus;
    return {
      ...data,
      lotCode:
        old?.data.lotCode ||
        `AG-${data.harvestDate.replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
      qualityReviewedBy: explicitReview
        ? user.name
        : preserve
          ? old?.data.qualityReviewedBy || null
          : null,
      qualityReviewedAt: explicitReview
        ? new Date().toISOString()
        : preserve
          ? old?.data.qualityReviewedAt || null
          : null,
    };
  }
  if (!distinct(data.lotIds))
    throw invalid("Each harvest lot can appear only once in a collection.");
  if (old && ["dispatched", "cancelled"].includes(old.data.status))
    throw new ApiError(
      409,
      "COLLECTION_FINAL",
      "A dispatched or cancelled collection is final. Create another collection to continue.",
    );
  if (!old && data.status !== "planning")
    throw invalid("Start a collection in planning, then confirm its supply.");
  if (data.status === "dispatched" && old?.data.status !== "confirmed")
    throw invalid("Confirm the collection before dispatching it.");
  if (old?.data.status === "confirmed" && data.status === "planning")
    throw invalid("A confirmed collection can be dispatched or cancelled.");
  if (
    old?.data.status === "confirmed" &&
    data.status !== "cancelled" &&
    JSON.stringify(data.lotIds) !== JSON.stringify(old.data.lotIds)
  )
    throw new ApiError(
      409,
      "COLLECTION_CONFIRMED",
      "Cancel this collection before changing its confirmed lot allocation.",
    );
  if (["confirmed", "dispatched"].includes(data.status) && !data.lotIds.length)
    throw invalid(
      "Add accepted harvest lots before confirming the collection.",
    );
  if (data.dealId) {
    const deal = await findEntity(db, user, "deals", data.dealId);
    if (!equalCrop(deal.data.crop, data.crop))
      throw invalid("The linked trade opportunity must use the same crop.");
  }
  if (
    old?.data.status === "confirmed" &&
    data.status !== "cancelled" &&
    ["crop", "buyer", "dealId", "priceUgxPerKg", "targetKg"].some(
      (key) => data[key] !== old.data[key],
    )
  )
    throw new ApiError(
      409,
      "COLLECTION_CONFIRMED",
      "Cancel the confirmed collection before changing its buyer, crop or commercial terms.",
    );
  if (
    old &&
    data.status === "cancelled" &&
    Object.keys(input).some(
      (key) =>
        !["status", "notes"].includes(key) &&
        JSON.stringify(input[key]) !== JSON.stringify(old.data[key]),
    )
  )
    throw invalid(
      "Cancel the collection without changing its original manifest or terms.",
    );
  return data;
}

export async function allocateCollection(
  db: Queryable,
  user: User,
  id: string,
  data: RecordData,
) {
  if (data.status === "cancelled") {
    await db.query(
      `DELETE FROM lot_allocations WHERE tenant_id=$1 AND collection_id=$2`,
      [user.organizationId, id],
    );
    return {};
  }
  const ids = [...data.lotIds].sort();
  const rows: EntityRow[] = [];
  // All writers lock lots in the same order. This serializes inventory edits
  // against concurrent collection reservations across PostgreSQL replicas.
  for (const lotId of ids) {
    const lot = await findEntity(db, user, "lots", lotId, true);
    if (!equalCrop(lot.data.crop, data.crop))
      throw invalid("All collection lots must contain the selected crop.");
    if (lot.data.qualityStatus !== "accepted")
      throw invalid(
        "Each lot needs an operator’s internal quality review before allocation.",
      );
    rows.push(lot);
  }
  const current = await db.query<{ lot_id: string; collection_id: string }>(
    `SELECT lot_id,collection_id FROM lot_allocations WHERE tenant_id=$1 AND lot_id=ANY($2::text[])`,
    [user.organizationId, ids],
  );
  if (current.rows.some((row) => row.collection_id !== id))
    throw new ApiError(
      409,
      "LOT_ALREADY_ALLOCATED",
      "A selected lot is already committed to another collection.",
    );
  const quantity = rows.reduce((sum, row) => sum + row.data.quantityKg, 0);
  if (quantity > 10_000_000)
    throw invalid("The collection quantity exceeds the supported range.");
  moneyTotal(quantity * data.priceUgxPerKg);
  if (
    ["confirmed", "dispatched"].includes(data.status) &&
    quantity < data.targetKg
  )
    throw invalid(
      "Allocated quantity must meet the stated buyer target before confirmation.",
    );
  await db.query(
    `DELETE FROM lot_allocations WHERE tenant_id=$1 AND collection_id=$2 AND NOT(lot_id=ANY($3::text[]))`,
    [user.organizationId, id, ids],
  );
  for (const lot of rows)
    await db.query(
      `INSERT INTO lot_allocations(tenant_id,lot_id,collection_id) VALUES($1,$2,$3) ON CONFLICT(tenant_id,lot_id) DO NOTHING`,
      [user.organizationId, lot.id, id],
    );
  const manifest = rows.map((lot) => ({
    lotId: lot.id,
    lotCode: lot.data.lotCode,
    quantityKg: lot.data.quantityKg,
    ownerId: lot.owner_id,
    qualityReviewedBy: lot.data.qualityReviewedBy,
    qualityReviewedAt: lot.data.qualityReviewedAt,
    qualityStatus: lot.data.qualityStatus,
    lotVersion: lot.version,
  }));
  await db.query(
    `UPDATE entities SET data=data || $2::jsonb WHERE id=$1 AND tenant_id=$3`,
    [id, JSON.stringify({ manifest }), user.organizationId],
  );
  return { manifest };
}

export async function decorateWorkflow(
  db: Queryable,
  user: User,
  type: string,
  entities: RecordData[],
) {
  if (type === "seasons")
    return entities.map((entity) => ({
      ...entity,
      summary: seasonSummary(entity),
    }));
  if (type === "lots") {
    const { rows } = await db.query<{
      lot_id: string;
      collection_id: string;
      status: string;
    }>(
      `SELECT a.lot_id,a.collection_id,c.data->>'status' AS status FROM lot_allocations a JOIN entities c ON c.id=a.collection_id WHERE a.tenant_id=$1`,
      [user.organizationId],
    );
    const byLot = new Map(
      rows.map((row) => [
        row.lot_id,
        { collectionId: row.collection_id, status: row.status },
      ]),
    );
    return entities.map((entity) => ({
      ...entity,
      allocation: byLot.get(entity.id) || null,
    }));
  }
  if (type === "collections") {
    if (user.role === "farmer") return [];
    const { rows } = await db.query<EntityRow>(
      `SELECT * FROM entities WHERE tenant_id=$1 AND type='lots'`,
      [user.organizationId],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return entities.map((entity) => {
      const lots = entity.lotIds
        .map((id: string) => byId.get(id))
        .filter(Boolean) as EntityRow[];
      const snapshot = Array.isArray(entity.manifest)
        ? entity.manifest
        : lots.map((lot) => ({
            quantityKg: lot.data.quantityKg,
            ownerId: lot.owner_id,
          }));
      const allocatedKg = snapshot.reduce(
        (sum: number, lot: any) => sum + lot.quantityKg,
        0,
      );
      return {
        ...entity,
        summary: {
          allocatedKg,
          contributorCount: new Set(snapshot.map((lot: any) => lot.ownerId))
            .size,
          targetProgressPercent: Math.round(
            (allocatedKg / entity.targetKg) * 100,
          ),
          estimatedValueUgx: moneyTotal(allocatedKg * entity.priceUgxPerKg),
        },
      };
    });
  }
  return entities;
}
