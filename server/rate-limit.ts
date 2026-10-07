import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import type { Queryable } from "./db.js";
import { sha256 } from "./security.js";

/**
 * An express-rate-limit store shared by every process using the database, so
 * limits hold across replicas. Windows use the database clock; keys (client
 * addresses, phone numbers) are stored only as salted hashes.
 */
export class DatabaseRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs = 60_000;

  constructor(
    private readonly db: Queryable,
    name: string,
  ) {
    this.prefix = `${name}:`;
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private hash(key: string) {
    return sha256(`agribridge-rate-limit:${this.prefix}${key}`);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const { rows } = await this.db.query<{ hits: number; reset_at: Date }>(
      `SELECT hits,reset_at FROM rate_limits WHERE key=$1 AND reset_at>now()`,
      [this.hash(key)],
    );
    return rows[0]
      ? { totalHits: rows[0].hits, resetTime: new Date(rows[0].reset_at) }
      : undefined;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const { rows } = await this.db.query<{ hits: number; reset_at: Date }>(
      `INSERT INTO rate_limits(key,hits,reset_at) VALUES($1,1,now()+make_interval(secs=>$2::double precision/1000))
       ON CONFLICT(key) DO UPDATE SET
         hits=CASE WHEN rate_limits.reset_at<=now() THEN 1 ELSE rate_limits.hits+1 END,
         reset_at=CASE WHEN rate_limits.reset_at<=now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
       RETURNING hits,reset_at`,
      [this.hash(key), this.windowMs],
    );
    // Expired counters are harmless but accumulate; trim them occasionally.
    if (Math.random() < 0.01)
      await this.db
        .query(
          `DELETE FROM rate_limits WHERE reset_at < now() - interval '1 hour'`,
        )
        .catch(() => {});
    return { totalHits: rows[0].hits, resetTime: new Date(rows[0].reset_at) };
  }

  async decrement(key: string) {
    await this.db.query(
      `UPDATE rate_limits SET hits=GREATEST(hits-1,0) WHERE key=$1 AND reset_at>now()`,
      [this.hash(key)],
    );
  }

  async resetKey(key: string) {
    await this.db.query(`DELETE FROM rate_limits WHERE key=$1`, [
      this.hash(key),
    ]);
  }
}
