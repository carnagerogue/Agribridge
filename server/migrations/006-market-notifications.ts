import type { Migration } from "./runner.js";

/** A profile phone is never a verified notification destination. */
export const marketNotifications: Migration = {
  version: 6,
  name: "market_notifications",
  statements: [
    `ALTER TABLE market_payment_notifications ADD CONSTRAINT market_payment_notifications_scope UNIQUE(tenant_id,id)`,
    `CREATE TABLE market_channel_link_challenges (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL,
      code_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      consumed_at timestamptz, FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id)
    )`,
    `CREATE INDEX market_link_challenges_owner_idx ON market_channel_link_challenges(tenant_id,owner_id,created_at)`,
    `CREATE TABLE market_channel_link_attempts (
      tenant_id text NOT NULL REFERENCES organizations(id), phone_hash text NOT NULL, hour_bucket timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0 CHECK(count>=0), PRIMARY KEY(tenant_id,phone_hash,hour_bucket)
    )`,
    `CREATE TABLE market_channel_bindings (
      tenant_id text NOT NULL REFERENCES organizations(id), owner_id text NOT NULL, phone text NOT NULL,
      payment_consent boolean NOT NULL DEFAULT false, language text NOT NULL DEFAULT 'en' CHECK(language IN ('en','lg')),
      verified_at timestamptz NOT NULL, consent_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,owner_id), UNIQUE(tenant_id,phone),
      FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id)
    )`,
    `CREATE TABLE market_notification_deliveries (
      notification_id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id),
      owner_id text NOT NULL, phone text, status text NOT NULL DEFAULT 'awaiting_link'
        CHECK(status IN ('awaiting_link','awaiting_consent','awaiting_configuration','blocked','prepared','sending','demo','sent','delivered','failed','uncertain','cancelled')),
      provider_id text, error_code text, lease_token text, lease_until timestamptz,
      prepared_at timestamptz, attempted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(tenant_id,owner_id) REFERENCES users(tenant_id,id),
      FOREIGN KEY(tenant_id,notification_id) REFERENCES market_payment_notifications(tenant_id,id), UNIQUE(tenant_id,provider_id)
    )`,
    `CREATE INDEX market_notification_delivery_state_idx ON market_notification_deliveries(status,lease_until)`,
  ],
};
