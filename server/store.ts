import { randomUUID, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import type { Database, Queryable } from "./db.js";
import type { AuthRequest, User } from "./security.js";
import { ApiError, sha256 } from "./security.js";
import { insertRecord, selectRecords, type EntityRow } from "./records.js";
export type { EntityRow };
export function present(row: EntityRow) {
  return {
    ...row.data,
    id: row.id,
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export async function audit(
  db: Queryable,
  user: User,
  action: string,
  type: string,
  id?: string,
) {
  await db.query(
    `INSERT INTO audit_events(id,tenant_id,actor_id,actor_name,action,entity_type,entity_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      randomUUID(),
      user.organizationId,
      user.id,
      user.name,
      action,
      type,
      id || null,
    ],
  );
}
export const ownTypes = new Set([
  "farms",
  "tasks",
  "reports",
  "progress",
  "settings",
  "seasons",
  "lots",
]);
export const operatorTypes = new Set([
  "contacts",
  "market-prices",
  "deals",
  "messages",
  "collections",
]);
export async function listEntities(db: Queryable, user: User, type: string) {
  if (
    user.role === "farmer" &&
    ["contacts", "deals", "messages", "collections"].includes(type)
  )
    return [];
  const own =
    (user.role === "farmer" && ownTypes.has(type)) ||
    ["progress", "settings"].includes(type);
  const rows = await selectRecords(
    db,
    type,
    own ? "tenant_id=$1 AND owner_id=$2" : "tenant_id=$1",
    own ? [user.organizationId, user.id] : [user.organizationId],
    "ORDER BY created_at DESC,id ASC LIMIT 1000",
  );
  return rows.map(present);
}
export async function findEntity(
  db: Queryable,
  user: User,
  type: string,
  id: string,
  lock = false,
) {
  const [row] = await selectRecords(
    db,
    type,
    "tenant_id=$1 AND id=$2",
    [user.organizationId, id],
    lock ? "FOR UPDATE" : "",
  );
  if (
    !row ||
    (user.role === "farmer" &&
      (ownTypes.has(type) || type === "offers") &&
      row.owner_id !== user.id)
  )
    throw new ApiError(404, "NOT_FOUND", "Record not found.");
  return row;
}
export async function insertEntity(
  db: Queryable,
  user: User,
  type: string,
  data: Record<string, unknown>,
  ownerId = user.id,
) {
  const row = await insertRecord(db, type, {
    tenantId: user.organizationId,
    ownerId,
    data,
  });
  return present(row!);
}
type MutationResult = { status: number; body: any };
const slowFingerprint = promisify(scryptCallback);
export async function mutate(
  db: Database,
  req: AuthRequest,
  operation: (tx: Queryable) => Promise<MutationResult>,
): Promise<MutationResult> {
  const user = req.user!;
  const key = req.get("idempotency-key");
  if (
    key &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key,
    )
  )
    throw new ApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Use a UUID for Idempotency-Key.",
    );
  // Never create a fast password verifier in the idempotency table.
  const fingerprintBody = { ...req.body };
  if (typeof fingerprintBody.password === "string")
    fingerprintBody.password = (
      (await slowFingerprint(
        fingerprintBody.password,
        `idempotency:${user.id}:${key || ""}`,
        64,
      )) as Buffer
    ).toString("hex");
  const hash = sha256(
    `${req.method}:${req.originalUrl}:${JSON.stringify(fingerprintBody)}`,
  );
  async function replay(tx: Queryable): Promise<MutationResult | undefined> {
    if (!key) return;
    const { rows } = await tx.query<any>(
      `SELECT request_hash,response,status FROM idempotency WHERE tenant_id=$1 AND user_id=$2 AND key=$3`,
      [user.organizationId, user.id, key],
    );
    if (!rows[0]) return;
    if (rows[0].request_hash !== hash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "This request key was already used for a different action.",
      );
    return { status: rows[0].status, body: rows[0].response };
  }
  try {
    return await db.transaction(async (tx) => {
      const previous = await replay(tx);
      if (previous) return previous;
      const result = await operation(tx);
      if (key)
        await tx.query(
          `INSERT INTO idempotency(tenant_id,user_id,key,request_hash,response,status) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
          [
            user.organizationId,
            user.id,
            key,
            hash,
            JSON.stringify(result.body),
            result.status,
          ],
        );
      return result;
    });
  } catch (error: any) {
    // A concurrent identical PATCH may lose its version check after the first
    // transaction commits. Recheck durable replay after any rollback, not only
    // a unique-key violation, before reporting a conflict to an offline client.
    if (key) {
      const previous = await replay(db);
      if (previous) return previous;
    }
    throw error;
  }
}
