import type { Database } from "./db.js";
import { DEMO_TENANT, DEMO_USERS } from "./seed.js";

/** Labels and provenance remain sample; rerunning never rewrites user changes. */
export async function seedMarketplace(db: Database) {
  const day = (offset: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(
      new Date(Date.now() + offset * 86_400_000),
    );
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO market_profiles(id,tenant_id,owner_id,sample,name,business_name,phone,district,community,farm_size_acres,crops,language)
      VALUES('70000000-0000-4000-8000-000000000001',$1,$2,true,'Grace Nambi','Grace’s farm · Sample','+256700000001','Nakaseke','Kikandwa',4.7,ARRAY['Maize','Beans'],'en') ON CONFLICT DO NOTHING`,
      [DEMO_TENANT, DEMO_USERS.farmer],
    );
    const supply = [
      {
        id: "71000000-0000-4000-8000-000000000001",
        crop: "Maize",
        variety: "White maize",
        quantity: 1800,
        price: 1400,
        start: 10,
        end: 35,
        grade: "Grade pending review",
        notes:
          "Sample planned harvest. Moisture and grade require measurement before any commitment.",
      },
      {
        id: "71000000-0000-4000-8000-000000000002",
        crop: "Beans",
        variety: "Nambale",
        quantity: 600,
        price: 3200,
        start: 3,
        end: 21,
        grade: "Unassessed",
        notes:
          "Sample supply declaration, not an inspected or guaranteed harvest.",
      },
    ];
    for (const row of supply)
      await tx.query(
        `INSERT INTO market_supply(id,tenant_id,owner_id,profile_id,sample,crop,variety,quantity_kg,expected_price_ugx_per_kg,harvest_from,harvest_until,district,community,grade,quality_notes)
      VALUES($1,$2,$3,'70000000-0000-4000-8000-000000000001',true,$4,$5,$6,$7,$8,$9,'Nakaseke','Kikandwa',$10,$11) ON CONFLICT DO NOTHING`,
        [
          row.id,
          DEMO_TENANT,
          DEMO_USERS.farmer,
          row.crop,
          row.variety,
          row.quantity,
          row.price,
          day(row.start),
          day(row.end),
          row.grade,
          row.notes,
        ],
      );
    const buyers = [
      {
        id: "72000000-0000-4000-8000-000000000001",
        organization: "Kampala Grain Partners · Sample buyer",
        crop: "Maize",
        variety: "White maize",
        grade: "Buyer grade specification; inspection required",
        quantity: 5000,
        price: 1550,
        district: "Kampala",
        from: 7,
        until: 40,
        requirements:
          "SAMPLE buyer request. Confirm moisture, sorting, collection costs and payment terms with a real buyer before selling. This organization and demand are fictional.",
      },
      {
        id: "72000000-0000-4000-8000-000000000002",
        organization: "Nakaseke Foods · Sample buyer",
        crop: "Beans",
        variety: "Nambale",
        grade: "Clean and sorted; review required",
        quantity: 1000,
        price: 3400,
        district: "Nakaseke",
        from: 0,
        until: 28,
        requirements:
          "SAMPLE request for demonstrating introductions. No purchase is promised; verify the actual crop quality and available stock.",
      },
      {
        id: "72000000-0000-4000-8000-000000000003",
        organization: "Central Produce Cooperative · Sample buyer",
        crop: "Coffee",
        variety: "Robusta",
        grade: "Dry cherry; review required",
        quantity: 2000,
        price: null,
        district: "Wakiso",
        from: 0,
        until: 45,
        requirements:
          "SAMPLE quote-on-request opportunity. Price, weighing and quality terms must be agreed with a real buyer.",
      },
    ];
    for (const row of buyers)
      await tx.query(
        `INSERT INTO market_demand(id,tenant_id,owner_id,sample,organization,crop,variety,grade,quantity_kg,price_ugx_per_kg,district,available_from,deadline,requirements)
      VALUES($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
        [
          row.id,
          DEMO_TENANT,
          DEMO_USERS.operator,
          row.organization,
          row.crop,
          row.variety,
          row.grade,
          row.quantity,
          row.price,
          row.district,
          day(row.from),
          day(row.until),
          row.requirements,
        ],
      );
    const services = [
      {
        id: "73000000-0000-4000-8000-000000000001",
        category: "input",
        name: "Maize seed · sample quote",
        provider: "Sample input supplier",
        crop: "Maize",
        price: 45000,
        unit: "2 kg pack",
        notes:
          "Fictional sample quote, not a recommendation or live supplier price. Confirm variety, pack size and supplier registration.",
      },
      {
        id: "73000000-0000-4000-8000-000000000002",
        category: "transport",
        name: "Shared produce collection · sample quote",
        provider: "Sample transport coordinator",
        crop: "",
        price: 120000,
        unit: "trip, up to 1,000 kg",
        notes:
          "Fictional route quote. Destination, capacity, loading, fuel and road access need confirmation; no booking is made.",
      },
      {
        id: "73000000-0000-4000-8000-000000000003",
        category: "storage",
        name: "Dry grain storage · sample quote",
        provider: "Sample community store",
        crop: "Maize",
        price: 3500,
        unit: "100 kg bag per month",
        notes:
          "Fictional sample charge, not a verified facility. Confirm capacity, moisture rules, security, insurance and handling fees.",
      },
    ];
    for (const row of services)
      await tx.query(
        `INSERT INTO market_services(id,tenant_id,owner_id,sample,category,name,provider,district,community,crop,price_ugx,unit,source_title,source_url,observed_at,valid_until,verification_status,notes)
      VALUES($1,$2,$3,true,$4,$5,$6,'Nakaseke','Kikandwa',$7,$8,$9,'Illustrative sample record; not a live web source','',$10,$11,'sample',$12) ON CONFLICT DO NOTHING`,
        [
          row.id,
          DEMO_TENANT,
          DEMO_USERS.operator,
          row.category,
          row.name,
          row.provider,
          row.crop,
          row.price,
          row.unit,
          day(0),
          day(14),
          row.notes,
        ],
      );
  });
}
