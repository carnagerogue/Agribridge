export type AppConfig = {
  production: boolean;
  demo: boolean;
  port: number;
  host: string;
  databaseUrl?: string;
  databasePath: string;
  publicOrigin: string;
  databaseTls: boolean;
  databaseCa?: string;
  /** `auto` applies pending migrations at startup; `verify` only checks them. */
  databaseMigrations: "auto" | "verify";
  cookieName: string;
  sessionHours: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const demo = env.AGRIBRIDGE_DEMO === "true";
  const publicOrigin = env.PUBLIC_ORIGIN || "http://localhost:5173";
  const host = env.HOST || "127.0.0.1";
  if (production && demo)
    throw new Error("Demo mode is forbidden in production.");
  if (demo && !["127.0.0.1", "localhost", "::1"].includes(host))
    throw new Error("Demo mode must bind to loopback.");
  if (production && !env.DATABASE_URL)
    throw new Error("Production requires PostgreSQL DATABASE_URL.");
  if (env.DATABASE_URL) {
    const database = new URL(env.DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(database.protocol))
      throw new Error("DATABASE_URL must use PostgreSQL.");
    if (
      production &&
      ["disable", "no-verify", "allow", "prefer"].includes(
        database.searchParams.get("sslmode") || "",
      )
    )
      throw new Error(
        "Production PostgreSQL must use certificate-verified TLS.",
      );
  }
  if (production && !publicOrigin.startsWith("https://"))
    throw new Error("Production requires HTTPS PUBLIC_ORIGIN.");
  const origin = new URL(publicOrigin);
  if (origin.origin !== publicOrigin)
    throw new Error(
      "PUBLIC_ORIGIN must be an exact origin without a trailing slash.",
    );
  const databaseMigrations = env.DATABASE_MIGRATIONS || "auto";
  if (databaseMigrations !== "auto" && databaseMigrations !== "verify")
    throw new Error('DATABASE_MIGRATIONS must be "auto" or "verify".');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PORT.");
  return {
    production,
    demo,
    port,
    host,
    databaseUrl: env.DATABASE_URL,
    databasePath: env.DATABASE_PATH || ".data/agribridge",
    publicOrigin,
    databaseTls: production || env.DATABASE_TLS === "true",
    databaseCa: env.DATABASE_CA_CERT,
    databaseMigrations,
    cookieName: production ? "__Host-agribridge" : "agribridge_session",
    sessionHours: 12,
  };
}
