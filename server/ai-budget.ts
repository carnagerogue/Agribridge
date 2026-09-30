import type { Database } from "./db.js";
import type { User } from "./security.js";
import type { AssistantLimits } from "./ai/index.js";

export function assistantBudget(db: Database, user: User) {
  const userScope = `user:${user.organizationId}:${user.id}`;
  return {
    async remaining(limits: AssistantLimits) {
      const { rows } = await db.query<{ scope: string; count: number }>(
        `SELECT scope,count FROM ai_daily_usage WHERE day=$1 AND scope IN ('global',$2)`,
        [limits.date, userScope],
      );
      const values = Object.fromEntries(
        rows.map((row) => [row.scope, row.count]),
      );
      return Math.max(
        0,
        Math.min(
          limits.dailyLimit - (values.global || 0),
          limits.perUserLimit - (values[userScope] || 0),
        ),
      );
    },
    async reserve(limits: AssistantLimits) {
      return db.transaction(async (tx) => {
        for (const scope of ["global", userScope])
          await tx.query(
            `INSERT INTO ai_daily_usage(scope,day,count) VALUES($1,$2,0) ON CONFLICT DO NOTHING`,
            [scope, limits.date],
          );
        const { rows } = await tx.query<{ scope: string; count: number }>(
          `SELECT scope,count FROM ai_daily_usage WHERE day=$1 AND scope IN ('global',$2) ORDER BY scope FOR UPDATE`,
          [limits.date, userScope],
        );
        const values = Object.fromEntries(
          rows.map((row) => [row.scope, row.count]),
        );
        const remaining = Math.max(
          0,
          Math.min(
            limits.dailyLimit - (values.global || 0),
            limits.perUserLimit - (values[userScope] || 0),
          ),
        );
        if (remaining <= 0) return { allowed: false, remaining: 0 };
        await tx.query(
          `UPDATE ai_daily_usage SET count=count+1 WHERE day=$1 AND scope IN ('global',$2)`,
          [limits.date, userScope],
        );
        return { allowed: true, remaining: remaining - 1 };
      });
    },
  };
}
