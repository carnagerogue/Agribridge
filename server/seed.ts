import type { Database } from "./db.js";
import { persistWhatsAppInbound } from "./whatsapp.js";
export const DEMO_TENANT = "org-demo-nakaseke";
export const DEMO_USERS = {
  farmer: "user-demo-grace",
  operator: "user-demo-amina",
  admin: "user-demo-admin",
};
export async function seedDemo(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO organizations(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING`,
      [DEMO_TENANT, "Nakaseke Growers · Sample cooperative"],
    );
    for (const [role, id] of Object.entries(DEMO_USERS))
      await tx.query(
        `INSERT INTO users(id,tenant_id,name,role) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [
          id,
          DEMO_TENANT,
          role === "farmer"
            ? "Grace Nambi"
            : role === "operator"
              ? "Amina Nakato"
              : "Daniel Okello",
          role,
        ],
      );
    await tx.query(
      `INSERT INTO users(id,tenant_id,name,role) VALUES('user-demo-peter',$1,'Peter Kato','farmer') ON CONFLICT DO NOTHING`,
      [DEMO_TENANT],
    );
    const today = new Date();
    const day = (offset: number) =>
      new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
    const records: [string, string, string, Record<string, unknown>][] = [
      [
        "farm-grace-maize",
        "farms",
        DEMO_USERS.farmer,
        {
          name: "Kikandwa maize field",
          district: "Nakaseke",
          latitude: 0.728,
          longitude: 32.385,
          areaAcres: 3.5,
          crop: "Maize",
          plantedAt: day(-24),
          ownerName: "Grace Nambi",
          stage: "growing",
          notes:
            "Sample farm record. Confirm planting and crop advice locally.",
        },
      ],
      [
        "farm-grace-beans",
        "farms",
        DEMO_USERS.farmer,
        {
          name: "Home bean garden",
          district: "Nakaseke",
          latitude: 0.741,
          longitude: 32.394,
          areaAcres: 1.2,
          crop: "Beans",
          plantedAt: day(-14),
          ownerName: "Grace Nambi",
          stage: "growing",
          notes: "Sample record for learning the app.",
        },
      ],
      [
        "farm-peter-coffee",
        "farms",
        "user-demo-peter",
        {
          name: "Bukomero coffee plot",
          district: "Kiboga",
          latitude: 0.697,
          longitude: 32.046,
          areaAcres: 5,
          crop: "Coffee",
          plantedAt: "2023-03-15",
          ownerName: "Peter Kato",
          stage: "growing",
          notes: "Sample cooperative member farm.",
        },
      ],
      [
        "task-scout",
        "tasks",
        DEMO_USERS.farmer,
        {
          farmId: "farm-grace-maize",
          title: "Walk the maize field and record changes",
          dueDate: day(0),
          category: "scouting",
          status: "pending",
          notes:
            "Check several parts of the field. Ask an extension officer to review concerns.",
        },
      ],
      [
        "task-records",
        "tasks",
        DEMO_USERS.farmer,
        {
          farmId: "farm-grace-beans",
          title: "Update the bean planting record",
          dueDate: day(1),
          category: "general",
          status: "pending",
          notes: "Keep dates and seed source together.",
        },
      ],
      [
        "task-lesson",
        "tasks",
        DEMO_USERS.farmer,
        {
          farmId: "",
          title: "Read the crop scouting field guide",
          dueDate: day(2),
          category: "learning",
          status: "pending",
          notes: "Draft lesson; awaiting agronomist review.",
        },
      ],
      [
        "task-follow-up",
        "tasks",
        DEMO_USERS.operator,
        {
          farmId: "farm-peter-coffee",
          title: "Call Peter about the next coffee collection",
          dueDate: day(0),
          category: "follow_up",
          status: "pending",
          notes: "Sample CRM task.",
        },
      ],
      [
        "contact-grace",
        "contacts",
        DEMO_USERS.operator,
        {
          name: "Grace Nambi",
          phone: "+256700000001",
          district: "Nakaseke",
          type: "farmer",
          crop: "Maize",
          stage: "active",
          preferredChannel: "sms",
          consent: false,
          notes: "Fictional sample contact. No delivery consent.",
        },
      ],
      [
        "contact-peter",
        "contacts",
        DEMO_USERS.operator,
        {
          name: "Peter Kato",
          phone: "+256700000002",
          district: "Kiboga",
          type: "farmer",
          crop: "Coffee",
          stage: "follow_up",
          preferredChannel: "voice",
          consent: false,
          notes: "Fictional sample contact.",
        },
      ],
      [
        "contact-buyer",
        "contacts",
        DEMO_USERS.operator,
        {
          name: "Lake Victoria Foods",
          phone: "+256700000003",
          district: "Kampala",
          type: "buyer",
          crop: "Beans",
          stage: "new",
          preferredChannel: "whatsapp",
          consent: false,
          notes: "Fictional sample buyer.",
        },
      ],
      [
        "price-maize-kampala",
        "market-prices",
        DEMO_USERS.operator,
        {
          crop: "Maize",
          market: "Kisenyi",
          district: "Kampala",
          priceUgx: 1450,
          unit: "kg",
          observedAt: today.toISOString(),
          source: "Sample training data",
          status: "sample",
        },
      ],
      [
        "price-maize-gulu",
        "market-prices",
        DEMO_USERS.operator,
        {
          crop: "Maize",
          market: "Gulu main market",
          district: "Gulu",
          priceUgx: 1320,
          unit: "kg",
          observedAt: today.toISOString(),
          source: "Sample training data",
          status: "sample",
        },
      ],
      [
        "price-beans-kampala",
        "market-prices",
        DEMO_USERS.operator,
        {
          crop: "Beans",
          market: "Nakasero",
          district: "Kampala",
          priceUgx: 3800,
          unit: "kg",
          observedAt: today.toISOString(),
          source: "Sample training data",
          status: "sample",
        },
      ],
      [
        "price-coffee-masaka",
        "market-prices",
        DEMO_USERS.operator,
        {
          crop: "Coffee",
          market: "Masaka collection centre",
          district: "Masaka",
          priceUgx: 9200,
          unit: "kg",
          observedAt: today.toISOString(),
          source: "Sample training data",
          status: "sample",
        },
      ],
      [
        "price-cassava-jinja",
        "market-prices",
        DEMO_USERS.operator,
        {
          crop: "Cassava",
          market: "Jinja central",
          district: "Jinja",
          priceUgx: 900,
          unit: "kg",
          observedAt: today.toISOString(),
          source: "Sample training data",
          status: "sample",
        },
      ],
      [
        "offer-grace",
        "offers",
        DEMO_USERS.farmer,
        {
          crop: "Maize",
          quantityKg: 800,
          priceUgx: 1400,
          district: "Nakaseke",
          sellerName: "Grace Nambi",
          description:
            "Sample offer. Dry grain; quality and availability require inspection.",
          status: "available",
        },
      ],
      [
        "offer-peter",
        "offers",
        "user-demo-peter",
        {
          crop: "Coffee",
          quantityKg: 450,
          priceUgx: 9000,
          district: "Kiboga",
          sellerName: "Peter Kato",
          description: "Sample offer, not an executable quotation.",
          status: "available",
        },
      ],
      [
        "deal-kigali",
        "deals",
        DEMO_USERS.operator,
        {
          buyer: "Kigali Harvest Co. · Sample",
          crop: "Beans",
          quantityKg: 12000,
          priceUgx: 3600,
          destination: "Kigali, Rwanda",
          incoterm: "FCA",
          stage: "qualified",
          checklist: ["Buyer due diligence", "Quality specification"],
          notes:
            "Sample opportunity. Confirm product, border, transport and regulatory requirements with qualified partners.",
        },
      ],
      [
        "deal-nairobi",
        "deals",
        DEMO_USERS.operator,
        {
          buyer: "Nairobi Grain Network · Sample",
          crop: "Maize",
          quantityKg: 24000,
          priceUgx: 1550,
          destination: "Nairobi, Kenya",
          incoterm: "DAP",
          stage: "inquiry",
          checklist: [],
          notes:
            "No customs clearance or payment processing is provided by this record.",
        },
      ],
      [
        "report-water",
        "reports",
        DEMO_USERS.farmer,
        {
          kind: "standing_water",
          district: "Nakaseke",
          farmId: "farm-grace-maize",
          description:
            "Sample observation: water remains beside the access path after rainfall. Local environmental review requested.",
          status: "submitted",
        },
      ],
      [
        "report-leaves",
        "reports",
        "user-demo-peter",
        {
          kind: "crop_pest",
          district: "Kiboga",
          farmId: "farm-peter-coffee",
          description:
            "Sample observation: some leaves have changed appearance. Awaiting extension officer assessment.",
          status: "reviewing",
        },
      ],
      [
        "season-grace-sample",
        "seasons",
        DEMO_USERS.farmer,
        {
          farmId: "farm-grace-maize",
          name: "Previous maize season · Sample",
          crop: "Maize",
          areaAcres: 3.5,
          plantingDate: day(-180),
          expectedHarvestDate: day(-65),
          expectedHarvestKg: 2000,
          reserveKg: 250,
          expectedPriceUgx: 1450,
          contingencyUgx: 50000,
          status: "active",
          costs: [
            {
              id: "sample-seed",
              category: "seed",
              label: "Planting material · Sample",
              plannedUgx: 220000,
              actualUgx: 215000,
            },
            {
              id: "sample-labour",
              category: "labour",
              label: "Hired field work · Sample",
              plannedUgx: 350000,
              actualUgx: null,
            },
            {
              id: "sample-transport",
              category: "transport",
              label: "Collection transport · Sample",
              plannedUgx: 120000,
              actualUgx: 0,
            },
          ],
          sales: [
            {
              id: "sample-sale",
              date: day(-30),
              quantityKg: 400,
              unitPriceUgx: 1400,
              buyer: "Sample local buyer",
              receivedUgx: 400000,
            },
          ],
          harvestedKg: 1800,
          notes:
            "Fictional cash planning example. Missing actual costs are not zero; estimates exclude unrecorded family labour and depreciation.",
        },
      ],
      [
        "lot-grace-sample",
        "lots",
        DEMO_USERS.farmer,
        {
          farmId: "farm-grace-maize",
          seasonId: "season-grace-sample",
          crop: "Maize",
          harvestDate: day(-60),
          quantityKg: 600,
          bagCount: 12,
          storageLocation: "Sample cooperative store, bay A",
          moisturePercent: null,
          measurementMethod: "not_recorded",
          testReference: "",
          qualityStatus: "accepted",
          qualityNotes:
            "Sample internal review only. No actual inspection, moisture test, laboratory result or certification.",
          notes: "Fictional lot used to demonstrate traceability.",
          lotCode: "AG-SAMPLE-MAIZE-001",
          qualityReviewedBy: "Sample operator",
          qualityReviewedAt: today.toISOString(),
        },
      ],
      [
        "lot-peter-sample",
        "lots",
        "user-demo-peter",
        {
          farmId: "farm-peter-coffee",
          crop: "Coffee",
          harvestDate: day(-20),
          quantityKg: 450,
          bagCount: 9,
          storageLocation: "Sample farm store",
          moisturePercent: null,
          measurementMethod: "not_recorded",
          testReference: "",
          qualityStatus: "unassessed",
          qualityNotes: "Awaiting sample intake review.",
          notes: "Fictional lot. No quality finding.",
          lotCode: "AG-SAMPLE-COFFEE-001",
          qualityReviewedBy: null,
          qualityReviewedAt: null,
        },
      ],
      [
        "collection-sample",
        "collections",
        DEMO_USERS.operator,
        {
          name: "Kampala maize collection · Sample",
          crop: "Maize",
          buyer: "Sample Kampala buyer",
          targetKg: 1200,
          priceUgxPerKg: 1500,
          collectionDate: day(5),
          meetingPoint: "Sample Nakaseke collection centre",
          destination: "Kampala",
          status: "planning",
          lotIds: ["lot-grace-sample"],
          notes:
            "Fictional buyer demand. No order, booking or payment is created.",
          manifest: [
            {
              lotId: "lot-grace-sample",
              lotCode: "AG-SAMPLE-MAIZE-001",
              quantityKg: 600,
              ownerId: DEMO_USERS.farmer,
              qualityStatus: "accepted",
              qualityReviewedBy: "Sample operator",
              qualityReviewedAt: today.toISOString(),
              lotVersion: 1,
            },
          ],
        },
      ],
    ];
    for (const [id, type, owner, data] of records)
      await tx.query(
        `INSERT INTO entities(id,type,tenant_id,owner_id,data) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING`,
        [
          id,
          type,
          DEMO_TENANT,
          owner,
          JSON.stringify({ ...data, sample: true }),
        ],
      );
    // Only establish the initial sample allocation while the original record is
    // unchanged. A later restart must never re-pledge a user-cancelled collection.
    await tx.query(
      `INSERT INTO lot_allocations(tenant_id,lot_id,collection_id) SELECT $1,'lot-grace-sample','collection-sample' FROM entities WHERE id='collection-sample' AND version=1 AND data->>'status'='planning' ON CONFLICT DO NOTHING`,
      [DEMO_TENANT],
    );
    for (const [id, body, contentType] of [
      [
        "sample-whatsapp-question",
        "SAMPLE: Our maize harvest is ready. Can the cooperative explain its collection process?",
        "text",
      ],
      [
        "sample-whatsapp-media",
        "SAMPLE: A non-text message. No image or voice recording was downloaded.",
        "unsupported",
      ],
    ] as const) {
      await persistWhatsAppInbound(
        tx,
        DEMO_TENANT,
        {
          eventId: id,
          channel: "whatsapp",
          provider: "meta",
          from: "+256700099991",
          body,
          contentType,
          command: "message",
          occurredAt: new Date(Date.now() - 3_600_000).toISOString(),
        },
        { id, sample: true },
      );
    }
  });
}
