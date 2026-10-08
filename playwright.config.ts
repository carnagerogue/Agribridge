import { defineConfig, devices } from "@playwright/test";
import { SECURE_BASE_URL, SECURE_PORT } from "./e2e/accounts.ts";

const port = Number(process.env.E2E_PORT || 5199);
const baseURL = `http://127.0.0.1:${port}`;

/**
 * End-to-end journeys on a low-end Android profile (360×640 Moto G4) with
 * throttled CPU and network; see e2e/fixtures.ts. Run `npm run test:e2e`.
 * Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to reuse a preinstalled Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  // Journeys share one demo database, so they run in a fixed order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    ...devices["Moto G4"],
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: [
    {
      command: "npx tsx e2e/server.ts",
      url: `${baseURL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { E2E_PORT: String(port) },
    },
    {
      command: "npx tsx e2e/server.ts",
      url: `${SECURE_BASE_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { E2E_MODE: "secure", E2E_PORT: String(SECURE_PORT) },
    },
  ],
});
