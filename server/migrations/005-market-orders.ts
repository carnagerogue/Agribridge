import type { Migration } from "./runner.js";

/** Orders reserve declared market supply; they never allocate existing harvest lots. */
export const marketOrders: Migration = {
  version: 5,
  name: "market_orders",
  statements: [
    `ALTER TABLE market_supply ADD CONSTRAINT market_supply_order_owner UNIQUE(tenant_id,id,owner_id)`,
    `CREATE TABLE market_orders (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), supply_id text NOT NULL,
      buyer_id text NOT NULL, seller_id text NOT NULL, quantity_kg integer NOT NULL CHECK(quantity_kg>0 AND quantity_kg<=10000000),
      price_ugx_per_kg integer CHECK(price_ugx_per_kg>0), total_ugx bigint CHECK(total_ugx>0 AND total_ugx<=1000000000000000),
      crop text NOT NULL, variety text NOT NULL DEFAULT '', grade text NOT NULL DEFAULT '', district text NOT NULL,
      harvest_from date NOT NULL, harvest_until date NOT NULL CHECK(harvest_until>=harvest_from),
      message text NOT NULL DEFAULT '', status text NOT NULL CHECK(status IN ('requested','accepted','cancelled','fulfilled')),
      version integer NOT NULL DEFAULT 1 CHECK(version>0), sample boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(buyer_id<>seller_id), CHECK((price_ugx_per_kg IS NULL)=(total_ugx IS NULL)),
      UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,supply_id,seller_id) REFERENCES market_supply(tenant_id,id,owner_id),
      FOREIGN KEY(tenant_id,buyer_id) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,seller_id) REFERENCES users(tenant_id,id)
    )`,
    `CREATE INDEX market_orders_supply_idx ON market_orders(tenant_id,supply_id,status)`,
    `CREATE INDEX market_orders_scope_idx ON market_orders(tenant_id,created_at DESC,id)`,
    `CREATE TABLE market_payments (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), order_id text NOT NULL,
      provider text NOT NULL, transaction_id text NOT NULL, payer_id text NOT NULL, payee_id text NOT NULL,
      amount_ugx bigint NOT NULL CHECK(amount_ugx>0 AND amount_ugx<=1000000000000000), currency text NOT NULL CHECK(currency='UGX'),
      status text NOT NULL CHECK(status IN ('authorized','succeeded','failed','refunded')),
      occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(provider,transaction_id), UNIQUE(tenant_id,id),
      FOREIGN KEY(tenant_id,order_id) REFERENCES market_orders(tenant_id,id),
      FOREIGN KEY(tenant_id,payer_id) REFERENCES users(tenant_id,id), FOREIGN KEY(tenant_id,payee_id) REFERENCES users(tenant_id,id)
    )`,
    `CREATE INDEX market_payments_order_idx ON market_payments(tenant_id,order_id,status)`,
    `CREATE TABLE market_payment_events (
      provider text NOT NULL, event_id text NOT NULL, tenant_id text NOT NULL REFERENCES organizations(id),
      payment_id text NOT NULL, event_hash text NOT NULL, status text NOT NULL, occurred_at timestamptz NOT NULL,
      applied boolean NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(provider,event_id), FOREIGN KEY(tenant_id,payment_id) REFERENCES market_payments(tenant_id,id)
    )`,
    `CREATE TABLE market_payment_notifications (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), payment_id text NOT NULL,
      recipient_id text NOT NULL, event_id text NOT NULL, provider text NOT NULL,
      kind text NOT NULL CHECK(kind IN ('payment_approved','payment_confirmed','payment_failed','payment_refunded')),
      body text NOT NULL, status text NOT NULL DEFAULT 'pending_configuration' CHECK(status IN ('pending_configuration','queued','sent','delivered','failed','uncertain')),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,event_id),
      FOREIGN KEY(tenant_id,payment_id) REFERENCES market_payments(tenant_id,id),
      FOREIGN KEY(tenant_id,recipient_id) REFERENCES users(tenant_id,id)
    )`,
    `CREATE INDEX market_payment_notifications_scope_idx ON market_payment_notifications(tenant_id,recipient_id,created_at DESC,id)`,
  ],
};
