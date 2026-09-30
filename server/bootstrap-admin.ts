import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { openDatabase, migrate } from "./db.js";
import { loadConfig } from "./config.js";
import { hashPassword } from "./security.js";

if (existsSync(".env")) process.loadEnvFile(".env");
const input = z
  .object({
    email: z.string().email(),
    password: z.string().min(14).max(256),
    name: z.string().min(2).max(100),
    organization: z.string().min(2).max(160),
  })
  .parse({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    name: process.env.BOOTSTRAP_ADMIN_NAME,
    organization: process.env.BOOTSTRAP_ORGANIZATION_NAME,
  });
const config = loadConfig();
if (config.demo)
  throw new Error("Disable AGRIBRIDGE_DEMO before provisioning real accounts.");
const db = await openDatabase(config);
await migrate(db);
try {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `SELECT id FROM users WHERE lower(email)=$1`,
      [input.email.toLowerCase()],
    );
    if (rows.length)
      throw new Error(
        "An account with this email already exists; no password or permissions were changed.",
      );
    const tenant = randomUUID();
    const id = randomUUID();
    await tx.query(`INSERT INTO organizations(id,name) VALUES($1,$2)`, [
      tenant,
      input.organization,
    ]);
    await tx.query(
      `INSERT INTO users(id,tenant_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5,'admin')`,
      [
        id,
        tenant,
        input.name,
        input.email.toLowerCase(),
        await hashPassword(input.password),
      ],
    );
    await tx.query(
      `INSERT INTO audit_events(id,tenant_id,actor_id,actor_name,action,entity_type,entity_id) VALUES($1,$2,$3,$4,'admin.bootstrapped','users',$3)`,
      [randomUUID(), tenant, id, input.name],
    );
    console.log(
      `Administrator created. Organization ID: ${tenant}. Remove bootstrap environment variables after provisioning.`,
    );
  });
} finally {
  await db.close();
}
