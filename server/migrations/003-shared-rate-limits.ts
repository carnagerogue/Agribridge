import type { Migration } from "./runner.js";

/**
 * Rate-limit counters shared by every application process. UNLOGGED: losing
 * counters after a database crash is acceptable, and skipping the write-ahead
 * log keeps per-request updates cheap. Keys are hashes, never raw addresses.
 */
export const sharedRateLimits: Migration = {
  version: 3,
  name: "shared_rate_limits",
  statements: [
    `CREATE UNLOGGED TABLE rate_limits (key text PRIMARY KEY CHECK (key ~ '^[0-9a-f]{64}$'), hits integer NOT NULL CHECK (hits >= 0), reset_at timestamptz NOT NULL)`,
    `CREATE INDEX rate_limits_expiry_idx ON rate_limits(reset_at)`,
  ],
};
