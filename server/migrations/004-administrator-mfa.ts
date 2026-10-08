import type { Migration } from "./runner.js";

/**
 * Time-based one-time passwords for two-factor sign-in. Secrets are stored
 * encrypted by the application; recovery codes and sign-in challenges are
 * stored only as hashes.
 */
export const administratorMfa: Migration = {
  version: 4,
  name: "administrator_mfa",
  statements: [
    `ALTER TABLE users ADD COLUMN mfa_secret text`,
    `ALTER TABLE users ADD COLUMN mfa_pending_secret text`,
    `ALTER TABLE users ADD COLUMN mfa_enabled_at timestamptz`,
    `ALTER TABLE users ADD COLUMN mfa_last_step bigint`,
    `ALTER TABLE users ADD CONSTRAINT users_mfa_consistent CHECK ((mfa_enabled_at IS NULL) = (mfa_secret IS NULL))`,
    `CREATE TABLE mfa_recovery_codes (user_id text NOT NULL REFERENCES users(id), code_hash text NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, code_hash))`,
    `CREATE TABLE mfa_challenges (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), attempts integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE INDEX mfa_challenges_user_idx ON mfa_challenges(user_id)`,
    `CREATE INDEX mfa_challenges_expiry_idx ON mfa_challenges(expires_at)`,
  ],
};
