import type { Migration } from "./runner.js";

/** Public buyers never inherit organization-member or cooperative staff authority. */
export const buyerMarketplace: Migration = {
  version: 7,
  name: "buyer_marketplace",
  statements: [
    `ALTER TABLE market_supply ADD COLUMN published boolean NOT NULL DEFAULT false`,
    `CREATE INDEX market_supply_public_idx ON market_supply(published,status,harvest_until,created_at DESC,id)`,
    `CREATE TABLE buyer_accounts (
      id text PRIMARY KEY, name text NOT NULL, business_name text NOT NULL DEFAULT '', phone text NOT NULL UNIQUE,
      email text NOT NULL DEFAULT '', district text NOT NULL, community text NOT NULL DEFAULT '',
      password_hash text NOT NULL, phone_verified boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE buyer_sessions (
      token_hash text PRIMARY KEY, buyer_id text NOT NULL REFERENCES buyer_accounts(id), csrf_token text NOT NULL,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX buyer_sessions_expiry_idx ON buyer_sessions(expires_at)`,
    `CREATE INDEX buyer_sessions_account_idx ON buyer_sessions(buyer_id)`,
    `CREATE TABLE buyer_idempotency (
      buyer_id text NOT NULL REFERENCES buyer_accounts(id), key text NOT NULL, request_hash text NOT NULL,
      response jsonb NOT NULL, status integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(buyer_id,key)
    )`,
    `CREATE TABLE buyer_orders (
      id text PRIMARY KEY, seller_tenant_id text NOT NULL REFERENCES organizations(id), supply_id text NOT NULL,
      seller_id text NOT NULL, buyer_id text NOT NULL REFERENCES buyer_accounts(id),
      quantity_kg integer NOT NULL CHECK(quantity_kg>0 AND quantity_kg<=10000000),
      price_ugx_per_kg integer NOT NULL CHECK(price_ugx_per_kg>0 AND price_ugx_per_kg<=100000000),
      total_ugx bigint NOT NULL CHECK(total_ugx>0 AND total_ugx<=1000000000000000),
      crop text NOT NULL, variety text NOT NULL DEFAULT '', grade text NOT NULL DEFAULT '', district text NOT NULL,
      community text NOT NULL, seller_name text NOT NULL, buyer_name text NOT NULL, buyer_business_name text NOT NULL DEFAULT '',
      harvest_from date NOT NULL, harvest_until date NOT NULL CHECK(harvest_until>=harvest_from), delivery_location text NOT NULL,
      requested_delivery_date date, message text NOT NULL DEFAULT '', status text NOT NULL CHECK(status IN ('requested','accepted','cancelled','fulfilled')),
      version integer NOT NULL DEFAULT 1 CHECK(version>0), source_version integer NOT NULL CHECK(source_version>0), sample boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(seller_tenant_id,id), CHECK(total_ugx=quantity_kg::bigint*price_ugx_per_kg),
      FOREIGN KEY(seller_tenant_id,supply_id,seller_id) REFERENCES market_supply(tenant_id,id,owner_id)
    )`,
    `CREATE INDEX buyer_orders_buyer_idx ON buyer_orders(buyer_id,created_at DESC,id)`,
    `CREATE INDEX buyer_orders_seller_idx ON buyer_orders(seller_tenant_id,seller_id,created_at DESC,id)`,
    `CREATE INDEX buyer_orders_stock_idx ON buyer_orders(seller_tenant_id,supply_id,status)`,
    `CREATE TABLE market_buyer_inquiries (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), phone text NOT NULL, event_id text NOT NULL,
      buyer_name text NOT NULL, business_name text NOT NULL, district text NOT NULL, crop text NOT NULL,
      variety text NOT NULL DEFAULT '', quantity_kg double precision NOT NULL CHECK(quantity_kg>0 AND quantity_kg<=100000000),
      grade text NOT NULL DEFAULT '', need_by date NOT NULL, status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','acknowledged','closed')),
      confirmed_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,event_id), UNIQUE(tenant_id,id),
      FOREIGN KEY(tenant_id,phone) REFERENCES market_channel_threads(tenant_id,phone)
    )`,
    `CREATE INDEX market_buyer_inquiries_scope_idx ON market_buyer_inquiries(tenant_id,status,created_at DESC,id)`,
  ],
};
