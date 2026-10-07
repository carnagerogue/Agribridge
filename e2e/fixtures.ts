import {
  test as base,
  expect,
  type CDPSession,
  type Page,
} from "@playwright/test";

/**
 * A constrained 3G connection and a 4× slower CPU, approximating an entry-level
 * Android phone on a rural network. Budgets and timeouts are set against this.
 */
export const CONSTRAINED_3G = {
  offline: false,
  latency: 300,
  downloadThroughput: (750 * 1024) / 8,
  uploadThroughput: (250 * 1024) / 8,
};

const sessions = new WeakMap<Page, CDPSession>();

export async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  sessions.set(page, cdp);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", CONSTRAINED_3G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

/**
 * Drops or restores the connection. The throttling session and Playwright's
 * offline switch are separate controls, and newer Chromium can let the
 * throttle's "online" win after a page load, so both are set together.
 */
export async function setNetwork(page: Page, state: "offline" | "3g") {
  const offline = state === "offline";
  await page.context().setOffline(offline);
  await sessions
    .get(page)
    ?.send("Network.emulateNetworkConditions", { ...CONSTRAINED_3G, offline });
}

/** Fails clearly if the harness, rather than the app, kept the page online. */
export async function expectBrowserOffline(page: Page) {
  await expect
    .poll(() => page.evaluate(() => navigator.onLine), {
      message: "the browser should report no connection",
    })
    .toBe(false);
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      // Failed requests while offline are expected and asserted separately.
      if (
        message.type() === "error" &&
        !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(
          message.text(),
        )
      )
        errors.push(message.text());
    });
    await use(errors);
  },
  page: async ({ page }, use, testInfo) => {
    const activity: string[] = [];
    const record = (entry: string) =>
      activity.push(entry) > 30 && activity.shift();
    const path = (url: string) => new URL(url).pathname;
    page.on("console", (message) =>
      record(`console.${message.type()}: ${message.text().slice(0, 160)}`),
    );
    page.on("requestfinished", async (request) =>
      record(
        `${request.method()} ${path(request.url())} → ${(await request.response())?.status()}${request.serviceWorker() ? " (service worker)" : ""}`,
      ),
    );
    page.on("requestfailed", (request) =>
      record(
        `${request.method()} ${path(request.url())} ✗ ${request.failure()?.errorText}`,
      ),
    );
    await throttle(page);
    await use(page);
    // CI keeps no traces, so describe the page state when a journey fails.
    if (testInfo.status !== testInfo.expectedStatus && !page.isClosed())
      console.log(
        `Failure context for "${testInfo.title}":\n` +
          JSON.stringify(await describe(page).catch(String), null, 2) +
          `\nRecent activity:\n  ${activity.join("\n  ")}`,
      );
  },
});

async function describe(page: Page) {
  return page.evaluate(async () => {
    const snapshots = await new Promise<unknown>((resolve) => {
      const open = indexedDB.open("agribridge-offline");
      open.onerror = () => resolve("unavailable");
      open.onsuccess = () => {
        if (!open.result.objectStoreNames.contains("snapshots"))
          return resolve("none");
        const all = open.result
          .transaction("snapshots")
          .objectStore("snapshots")
          .getAll();
        all.onsuccess = () =>
          resolve(
            all.result.map((row: any) => ({
              savedAt: row.savedAt,
              farms: row.data?.farms?.length,
              tasks: row.data?.tasks?.length,
            })),
          );
      };
    });
    return {
      url: location.pathname,
      navigatorOnline: navigator.onLine,
      serviceWorkerControlled: !!navigator.serviceWorker?.controller,
      storageKeys: Object.keys(localStorage),
      snapshots,
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 600),
    };
  });
}
export { expect };

export async function signInAsDemo(page: Page, role: "farmer" | "operator") {
  await page.goto("/login");
  await page
    .getByRole("button", {
      name: role === "farmer" ? "Try farmer demo" : "Try cooperative demo",
    })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    role === "farmer" ? "Hello, Grace." : "Hello, Amina.",
  );
}

/**
 * Opens a destination the way a phone user would: the bottom bar for core
 * sections, otherwise the menu drawer and its tool group.
 */
export async function openSection(
  page: Page,
  name: string,
  group?: "More tools" | "Cooperative tools",
) {
  if (!group) {
    await page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    return;
  }
  await page.getByRole("button", { name: "Menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  const toggle = drawer.getByRole("button", { name: group });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  await drawer.getByRole("link", { name, exact: true }).click();
}
