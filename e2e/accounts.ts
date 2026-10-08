/**
 * Fictional accounts for the end-to-end "secure" server, which runs without
 * demo mode so administrator two-factor sign-in is enforced. Test-only values.
 */
export const SECURE_ADMIN = {
  email: "e2e-admin@example.org",
  password: "end to end administrator passphrase",
  name: "Esther Admin",
};
export const E2E_MFA_KEY = Buffer.alloc(32, 42).toString("base64");

/** The second end-to-end server runs without demo mode on this address. */
export const SECURE_PORT = 5198;
export const SECURE_BASE_URL = `http://127.0.0.1:${SECURE_PORT}`;
