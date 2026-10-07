import type { Page } from "@playwright/test";
import { FORECAST_FIXTURE, MARKET_FIXTURE } from "./external.ts";
import { expect, openSection, signInAsDemo, test } from "./fixtures.ts";

async function openTasks(page: Page) {
  await openSection(page, "Farms");
  await page.getByRole("button", { name: /^Tasks/ }).click();
}

/**
 * Bytes a first-time visitor downloads for the public introduction, before
 * signing in. Mobile data is costly; raise this only deliberately.
 */
const FIRST_VISIT_BUDGET_BYTES = 250 * 1024;

async function transferredBytes(page: Page, work: () => Promise<void>) {
  let total = 0;
  const pending: Promise<void>[] = [];
  const listener = (request: import("@playwright/test").Request) =>
    pending.push(
      request
        .sizes()
        .then((sizes) => {
          total += sizes.responseBodySize + sizes.responseHeadersSize;
        })
        .catch(() => {}),
    );
  page.on("requestfinished", listener);
  await work();
  await page.waitForLoadState("networkidle");
  page.off("requestfinished", listener);
  await Promise.all(pending);
  return total;
}

test("the public introduction is light, fits a small phone and leads to sign-in", async ({
  page,
  consoleErrors,
}) => {
  const bytes = await transferredBytes(page, async () => {
    await page.goto("/");
  });
  await expect(
    page.getByRole("heading", { level: 1, name: /./ }),
  ).toBeVisible();
  console.log(`First visit transferred ${Math.round(bytes / 1024)} KB`);
  expect(bytes).toBeLessThan(FIRST_VISIT_BUDGET_BYTES);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, "no sideways scrolling at 360px").toBeLessThanOrEqual(0);
  await page
    .getByRole("link", { name: /sign in/i })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Try farmer demo" }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("a farmer completes today's task and it stays completed", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "farmer");
  await openTasks(page);
  const task = "Walk the maize field and record changes";
  await page.getByRole("button", { name: `Complete ${task}` }).click();
  await expect(
    page.getByRole("button", { name: `Reopen ${task}` }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Tasks/ }).click();
  await expect(
    page.getByRole("button", { name: `Reopen ${task}` }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("a farmer's offline change waits on the phone and syncs on reconnect", async ({
  page,
  context,
}) => {
  await signInAsDemo(page, "farmer");
  await page.goto("/settings");
  const keep = page.getByRole("switch", {
    name: "Keep farm records and lessons on this device",
  });
  // The switch saves before it changes state, so wait rather than assume.
  await keep.click();
  await expect(keep).toBeChecked();
  await openTasks(page);
  const task = "Update the bean planting record";
  await expect(
    page.getByRole("button", { name: `Complete ${task}` }),
  ).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("You’re offline.")).toBeVisible();
  await page.getByRole("button", { name: `Complete ${task}` }).click();
  await expect(page.getByText("Awaiting sync")).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText("Awaiting sync")).toBeHidden({
    timeout: 30_000,
  });
  const saved = await page.evaluate(async (title) => {
    const response = await fetch("/api/tasks", { credentials: "same-origin" });
    const tasks = (await response.json()) as {
      title: string;
      status: string;
    }[];
    return tasks.find((item) => item.title === title)?.status;
  }, task);
  expect(saved).toBe("completed");
});

test("a saved workspace reopens without a connection", async ({
  page,
  context,
}) => {
  await signInAsDemo(page, "farmer");
  // A full load of Settings: the workspace is still arriving over 3G when
  // the farmer turns on device storage, then the connection drops at once.
  await page.goto("/settings");
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const keep = page.getByRole("switch", {
    name: "Keep farm records and lessons on this device",
  });
  await keep.click();
  await expect(keep).toBeChecked();

  await context.setOffline(true);
  await page.goto("/farms");
  await expect(page.getByText("You’re offline.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kikandwa maize field" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Tasks/ }).click();
  await expect(
    page.getByRole("button", { name: /Walk the maize field/ }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("device storage stays off until the workspace has loaded", async ({
  page,
}) => {
  await signInAsDemo(page, "farmer");
  // The workspace cannot load, so there is nothing trustworthy to save.
  await page.route("**/api/bootstrap", (route) => route.abort());
  await page.goto("/settings");
  const keep = page.getByRole("switch", {
    name: "Keep farm records and lessons on this device",
  });
  await keep.click();
  await expect(
    page.getByText(
      "Connect to load your workspace before saving it on this device.",
    ),
  ).toBeVisible();
  await expect(keep).not.toBeChecked();
});

test("weather shows a dated model forecast for the farm", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "farmer");
  await openSection(page, "Weather");
  await expect(page.getByText(/Open-Meteo/).first()).toBeVisible();
  await expect(
    page
      .getByText(new RegExp(`${Math.round(FORECAST_FIXTURE.temperature)}`))
      .first(),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("prices show dated public observations, not live quotes", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "farmer");
  await openSection(page, "Prices");
  await expect(page.getByText("Not today’s buyer quotes.")).toBeVisible();
  const first = page
    .getByRole("region", { name: "Published prices" })
    .getByRole("article")
    .filter({ hasText: MARKET_FIXTURE.market })
    .filter({
      has: page.getByRole("heading", { name: MARKET_FIXTURE.commodity }),
    })
    .first();
  await expect(first).toBeVisible({ timeout: 30_000 });
  await expect(first).toContainText("Date observed");
  await expect(
    first.getByRole("link", { name: "Source: WFP / HDX" }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("cooperative tools stay hidden from farmers", async ({ page }) => {
  await signInAsDemo(page, "farmer");
  await page.getByRole("button", { name: "Menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(
    drawer.getByRole("button", { name: "More tools" }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Cooperative tools" }),
  ).toHaveCount(0);
});

test("an operator reviews the sample collection manifest", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "operator");
  await openSection(page, "Harvest & collection", "More tools");
  await page.getByRole("tab", { name: /^Buyer collections/ }).click();
  await expect(
    page.getByText("Kampala maize collection · Sample").first(),
  ).toBeVisible();
  await expect(page.getByText("AG-SAMPLE-MAIZE-001").first()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
