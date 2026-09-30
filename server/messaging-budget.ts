import type { Database } from "./db.js";
import { sha256 } from "./security.js";

function limit(value: string | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maximum
    ? parsed
    : 0;
}
export function reserveMessageBudget(
  db: Database,
  tenantId: string,
  phone: string,
  env: NodeJS.ProcessEnv = process.env,
  date = new Date().toISOString().slice(0, 10),
) {
  const scopes: [string, number][] = [
    ["global", limit(env.MESSAGING_DAILY_LIMIT, 200, 5000)],
    [`tenant:${tenantId}`, limit(env.MESSAGING_TENANT_DAILY_LIMIT, 100, 5000)],
    [
      `recipient:${sha256(phone)}`,
      limit(env.MESSAGING_RECIPIENT_DAILY_LIMIT, 5, 20),
    ],
  ];
  return db.transaction(async (tx) => {
    for (const [scope] of scopes)
      await tx.query(
        `INSERT INTO messaging_daily_usage(scope,day,count) VALUES($1,$2,0) ON CONFLICT DO NOTHING`,
        [scope, date],
      );
    const { rows } = await tx.query<{ scope: string; count: number }>(
      `SELECT scope,count FROM messaging_daily_usage WHERE day=$1 AND scope IN ($2,$3,$4) ORDER BY scope FOR UPDATE`,
      [date, ...scopes.map(([scope]) => scope)],
    );
    const values = Object.fromEntries(
      rows.map((row) => [row.scope, row.count]),
    );
    if (scopes.some(([scope, maximum]) => (values[scope] || 0) >= maximum))
      return false;
    await tx.query(
      `UPDATE messaging_daily_usage SET count=count+1 WHERE day=$1 AND scope IN ($2,$3,$4)`,
      [date, ...scopes.map(([scope]) => scope)],
    );
    return true;
  });
}
