import type { Migration } from "./runner.js";

/** Short-lived password reset codes sent by SMS, stored only as hashes. */
export const passwordRecovery: Migration = {
  version: 5,
  name: "password_recovery",
  statements: [
    `CREATE TABLE password_resets (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0), expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE INDEX password_resets_user_idx ON password_resets(user_id, created_at DESC)`,
    `CREATE INDEX password_resets_expiry_idx ON password_resets(expires_at)`,
  ],
};
