import type { Migration } from "./runner.js";

/** Private channel identity is deliberately separate from application accounts. */
export const marketConversations: Migration = {
  version: 4,
  name: "market_conversations",
  statements: [
    `CREATE TABLE market_channel_threads (
      tenant_id text NOT NULL REFERENCES organizations(id), phone text NOT NULL,
      language text NOT NULL DEFAULT 'en' CHECK(language IN ('en','lg')),
      state text NOT NULL DEFAULT 'menu' CHECK(state IN ('menu','consent','name','business','community','district','crops','farm_size','confirm','supply_crop','supply_variety','supply_quantity','supply_from','supply_until','supply_confirm')),
      consented boolean NOT NULL DEFAULT false, paused boolean NOT NULL DEFAULT false,
      draft jsonb NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1 CHECK(version>0),
      last_event_at timestamptz, last_event_id text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id,phone)
    )`,
    `CREATE TABLE market_channel_profiles (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), phone text NOT NULL,
      name text NOT NULL, business_name text NOT NULL, community text NOT NULL, district text NOT NULL,
      crops text[] NOT NULL CHECK(cardinality(crops) BETWEEN 1 AND 10),
      farm_size_acres double precision CHECK(farm_size_acres>0 AND farm_size_acres<=100000),
      language text NOT NULL CHECK(language IN ('en','lg')), version integer NOT NULL DEFAULT 1 CHECK(version>0),
      confirmed_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id,phone), UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,phone) REFERENCES market_channel_threads(tenant_id,phone)
    )`,
    `CREATE TABLE market_conversation_jobs (
      id text PRIMARY KEY, sequence bigserial NOT NULL UNIQUE,
      tenant_id text NOT NULL REFERENCES organizations(id), phone text NOT NULL, event_id text NOT NULL,
      body text, content_type text NOT NULL CHECK(content_type IN ('text','unsupported')),
      event_at timestamptz NOT NULL, kind text NOT NULL DEFAULT 'message' CHECK(kind IN ('message','handoff')),
      status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','preparing','ready','sending','sent','delivered','demo','failed','uncertain','cancelled','expired')),
      reply_body text, provider_id text, error_code text,
      attempts integer NOT NULL DEFAULT 0, lease_token text, lease_until timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
      UNIQUE(tenant_id,event_id), FOREIGN KEY(tenant_id,phone) REFERENCES market_channel_threads(tenant_id,phone),
      CHECK(body IS NULL OR length(body)<=1600), CHECK(reply_body IS NULL OR length(reply_body)<=1600)
    )`,
    `CREATE INDEX market_conversation_pending_idx ON market_conversation_jobs(status,sequence)`,
    `CREATE INDEX market_conversation_thread_idx ON market_conversation_jobs(tenant_id,phone,sequence)`,
    `CREATE INDEX market_conversation_expiry_idx ON market_conversation_jobs(expires_at)`,
    `CREATE TABLE market_channel_supply (
      id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES organizations(id), profile_id text NOT NULL,
      event_id text NOT NULL, crop text NOT NULL, variety text NOT NULL DEFAULT '',
      quantity_kg double precision NOT NULL CHECK(quantity_kg>0 AND quantity_kg<=100000000),
      harvest_from date NOT NULL, harvest_until date NOT NULL CHECK(harvest_until>=harvest_from),
      district text NOT NULL, community text NOT NULL, status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','acknowledged','closed')),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,event_id),
      FOREIGN KEY(tenant_id,profile_id) REFERENCES market_channel_profiles(tenant_id,id)
    )`,
  ],
};
