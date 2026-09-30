import { z } from "zod";
const short = z.string().trim().min(1).max(160);
const note = z.string().trim().max(3000).default("");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Invalid date",
  );
const money = z.number().int().min(0).max(1_000_000_000_000);
const kg = z.number().min(0).max(10_000_000);
const perKg = z.number().int().min(0).max(10_000_000);
const reference = z.string().trim().min(1).max(80);
export const channel = z.enum(["sms", "whatsapp", "voice", "ussd"]);
export const schemas = {
  farms: z
    .object({
      name: short,
      district: short,
      latitude: z.number().min(-1.6).max(4.3),
      longitude: z.number().min(29.4).max(35.1),
      areaAcres: z.number().positive().max(1_000_000),
      crop: short,
      plantedAt: day,
      ownerName: short,
      stage: z.enum(["planning", "planted", "growing", "harvesting", "fallow"]),
      notes: note,
    })
    .strict(),
  tasks: z
    .object({
      farmId: z.string().max(80).default(""),
      title: short,
      dueDate: day,
      category: z.enum([
        "planting",
        "watering",
        "scouting",
        "harvest",
        "learning",
        "follow_up",
        "general",
      ]),
      status: z.enum(["pending", "completed"]).default("pending"),
      notes: note,
    })
    .strict(),
  contacts: z
    .object({
      name: short,
      phone: z
        .string()
        .regex(
          /^\+256[37]\d{8}$/,
          "Use a Uganda number such as +2567XXXXXXXX.",
        ),
      district: short,
      type: z.enum(["farmer", "buyer", "cooperative", "supplier"]),
      crop: short,
      stage: z.enum(["new", "active", "follow_up"]),
      preferredChannel: channel,
      consent: z.boolean(),
      notes: note,
    })
    .strict(),
  "market-prices": z
    .object({
      crop: short,
      market: short,
      district: short,
      priceUgx: z.number().positive().max(100_000_000),
      unit: z.literal("kg").default("kg"),
      observedAt: z.string().datetime(),
      source: short,
      status: z.enum(["reported", "verified"]),
    })
    .strict(),
  offers: z
    .object({
      crop: short,
      quantityKg: z.number().positive().max(1_000_000_000),
      priceUgx: z.number().positive().max(100_000_000),
      district: short,
      sellerName: short,
      description: note,
      status: z.enum(["available", "reserved", "sold"]).default("available"),
    })
    .strict(),
  deals: z
    .object({
      buyer: short,
      crop: short,
      quantityKg: z.number().positive().max(1_000_000_000),
      priceUgx: z.number().positive().max(1_000_000_000),
      destination: short,
      incoterm: z.enum(["EXW", "FCA", "FOB", "CIF", "DAP"]),
      stage: z.enum([
        "inquiry",
        "qualified",
        "contracted",
        "in_transit",
        "delivered",
      ]),
      checklist: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
      notes: note,
    })
    .strict(),
  reports: z
    .object({
      kind: z.enum(["crop_pest", "crop_disease", "standing_water"]),
      district: short,
      farmId: z.string().max(80).optional(),
      description: z.string().trim().min(10).max(3000),
      status: z
        .enum(["submitted", "reviewing", "resolved"])
        .default("submitted"),
      latitude: z.number().min(-1.6).max(4.3).optional(),
      longitude: z.number().min(29.4).max(35.1).optional(),
    })
    .strict(),
  seasons: z
    .object({
      farmId: reference,
      name: short,
      crop: short,
      areaAcres: z.number().positive().max(1_000_000),
      plantingDate: day,
      expectedHarvestDate: day,
      expectedHarvestKg: kg,
      reserveKg: kg.default(0),
      expectedPriceUgx: perKg,
      contingencyUgx: money.default(0),
      status: z.enum(["planning", "active", "closed"]).default("planning"),
      costs: z
        .array(
          z
            .object({
              id: reference,
              category: z.enum([
                "seed",
                "inputs",
                "labour",
                "equipment",
                "transport",
                "storage",
                "other",
              ]),
              label: short,
              plannedUgx: money,
              actualUgx: money.nullable().default(null),
            })
            .strict(),
        )
        .max(80)
        .default([]),
      sales: z
        .array(
          z
            .object({
              id: reference,
              date: day,
              quantityKg: kg.refine(
                (value) => value > 0,
                "Quantity must be positive",
              ),
              unitPriceUgx: perKg,
              buyer: short,
              receivedUgx: money.default(0),
            })
            .strict(),
        )
        .max(120)
        .default([]),
      harvestedKg: kg.default(0),
      notes: note,
    })
    .strict(),
  lots: z
    .object({
      farmId: reference,
      seasonId: z.string().max(80).optional(),
      crop: short,
      harvestDate: day,
      quantityKg: kg.refine((value) => value > 0, "Quantity must be positive"),
      bagCount: z.number().int().min(0).max(1_000_000),
      storageLocation: short,
      moisturePercent: z.number().min(0).max(100).nullable().default(null),
      measurementMethod: z
        .enum(["not_recorded", "meter", "lab_report", "other"])
        .default("not_recorded"),
      testReference: z.string().trim().max(200).default(""),
      qualityStatus: z
        .enum(["unassessed", "pending_test", "accepted", "on_hold", "rejected"])
        .default("unassessed"),
      qualityNotes: note,
      notes: note,
    })
    .strict(),
  collections: z
    .object({
      name: short,
      crop: short,
      buyer: short,
      dealId: z.string().max(80).optional(),
      targetKg: kg.refine((value) => value > 0, "Target must be positive"),
      priceUgxPerKg: perKg,
      collectionDate: day,
      meetingPoint: short,
      destination: short,
      status: z
        .enum(["planning", "confirmed", "dispatched", "cancelled"])
        .default("planning"),
      lotIds: z.array(reference).max(200).default([]),
      notes: note,
    })
    .strict(),
};
export type EntityType = keyof typeof schemas;
export const settingsSchema = z
  .object({
    language: z.enum(["en", "lg", "sw"]),
    lowDataMode: z.boolean(),
    preferredChannel: channel,
    notifications: z.boolean(),
  })
  .strict();
export const defaultSettings = {
  language: "en",
  lowDataMode: true,
  preferredChannel: "sms",
  notifications: false,
};
