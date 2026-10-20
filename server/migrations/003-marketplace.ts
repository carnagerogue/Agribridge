import type { Migration } from "./runner.js";

/** Market participation is separate from the existing farm, lot and trade records. */
export const marketplace: Migration = {
  version: 3,
  name: "marketplace",
  statements: [
    `ALTER TABLE users ADD CONSTRAINT marketplace_users_scope UNIQUE (tenant_id,id)`,
    `CREATE TABLE market_profiles (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK(version>0), sample boolean NOT NULL DEFAULT false,
      name text NOT NULL, business_name text NOT NULL, phone text NOT NULL,
      district text NOT NULL, community text NOT NULL, farm_size_acres double precision CHECK(farm_size_acres>0 AND farm_size_acres<=100000),
      crops text[] NOT NULL CHECK(cardinality(crops) BETWEEN 1 AND 20), language text NOT NULL CHECK(language IN ('en','lg')),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,owner_id), UNIQUE(tenant_id,id,owner_id), UNIQUE(tenant_id,id),
      FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id)
    )`,
    `CREATE TABLE market_supply (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL, profile_id text NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK(version>0), sample boolean NOT NULL DEFAULT false,
      crop text NOT NULL, variety text NOT NULL DEFAULT '', quantity_kg double precision NOT NULL CHECK(quantity_kg>0 AND quantity_kg<=100000000),
      expected_price_ugx_per_kg integer CHECK(expected_price_ugx_per_kg>0 AND expected_price_ugx_per_kg<=100000000),
      harvest_from date NOT NULL, harvest_until date NOT NULL CHECK(harvest_until>=harvest_from),
      district text NOT NULL, community text NOT NULL, grade text NOT NULL DEFAULT '', quality_notes text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','paused','sold')),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id),
      FOREIGN KEY(tenant_id,profile_id,owner_id) REFERENCES market_profiles(tenant_id,id,owner_id)
    )`,
    `CREATE INDEX market_supply_scope_idx ON market_supply(tenant_id,owner_id,created_at DESC,id)`,
    `CREATE TABLE market_demand (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK(version>0), sample boolean NOT NULL DEFAULT false,
      organization text NOT NULL, crop text NOT NULL, variety text NOT NULL DEFAULT '', grade text NOT NULL DEFAULT '',
      quantity_kg double precision NOT NULL CHECK(quantity_kg>0 AND quantity_kg<=100000000), price_ugx_per_kg integer CHECK(price_ugx_per_kg>0 AND price_ugx_per_kg<=100000000),
      district text NOT NULL, available_from date NOT NULL, deadline date NOT NULL CHECK(deadline>=available_from),
      requirements text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','paused','closed')),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id)
    )`,
    `CREATE INDEX market_demand_scope_idx ON market_demand(tenant_id,deadline,created_at DESC,id)`,
    `CREATE TABLE market_services (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK(version>0), sample boolean NOT NULL DEFAULT false,
      category text NOT NULL CHECK(category IN ('input','transport','storage')), name text NOT NULL, provider text NOT NULL,
      district text NOT NULL, community text NOT NULL DEFAULT '', crop text NOT NULL DEFAULT '', price_ugx integer NOT NULL CHECK(price_ugx>0 AND price_ugx<=1000000000),
      unit text NOT NULL, source_title text NOT NULL, source_url text NOT NULL DEFAULT '', observed_at date NOT NULL,
      valid_until date NOT NULL CHECK(valid_until>=observed_at), verification_status text NOT NULL CHECK(verification_status IN ('sample','reported','verified')),
      notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id), CHECK(verification_status<>'sample' OR sample=true)
    )`,
    `CREATE INDEX market_services_scope_idx ON market_services(tenant_id,category,district,valid_until)`,
    `CREATE TABLE market_interests (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL,
      version integer NOT NULL DEFAULT 1 CHECK(version>0), sample boolean NOT NULL DEFAULT false,
      supply_id text NOT NULL, demand_id text NOT NULL, message text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','acknowledged','closed')),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,id), UNIQUE(tenant_id,owner_id,supply_id,demand_id),
      FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id),
      FOREIGN KEY(tenant_id,supply_id) REFERENCES market_supply(tenant_id,id), FOREIGN KEY(tenant_id,demand_id) REFERENCES market_demand(tenant_id,id)
    )`,
    `CREATE INDEX market_interests_scope_idx ON market_interests(tenant_id,owner_id,created_at DESC,id)`,
  ],
};
