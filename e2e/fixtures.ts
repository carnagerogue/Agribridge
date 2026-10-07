import { test as base, expect, type Page } from "@playwright/test";

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

export async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", CONSTRAINED_3G);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
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
  page: async ({ page }, use) => {
    await throttle(page);
    await use(page);
  },
});
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
