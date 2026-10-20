import { expect, openSection, signInAsDemo, test } from "./fixtures.ts";

test("a farmer records a harvest window and quantity that survive reopening", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "farmer");
  await openSection(page, "Marketplace");
  await expect(
    page.getByRole("heading", { name: "Marketplace", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "My produce", exact: true }).click();
  await page.getByRole("button", { name: "Add produce", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "List your produce" });
  await dialog.getByLabel(/^Crop/).selectOption("Maize");
  await dialog.getByLabel(/^Variety/).fill("E2E white maize");
  await dialog.getByLabel("Available quantity (kg)").fill("125");
  await dialog.getByLabel("Asking price (UGX / kg)").fill("1500");
  await dialog
    .getByRole("button", { name: "Save listing", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: /E2E white maize/ }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "My produce", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /E2E white maize/ }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toContainText("125");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("the market desk shows sourced input records without substituting a different product", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "farmer");
  await openSection(page, "Marketplace");
  await page
    .getByLabel("Your market question")
    .fill("What are farm input costs in Nakaseke?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  const answer = page.locator(".market-desk-answer");
  await expect(answer).toContainText("SAMPLE");
  await expect(answer).toContainText("valid through");
  await page
    .getByLabel("Your market question")
    .fill("fertilizer price for maize in Nakaseke");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(answer).toContainText("No current input-cost");
  await expect(answer).not.toContainText("seed pack");
  expect(consoleErrors).toEqual([]);
});

test("a cooperative records, accepts and cancels an order without claiming a payment", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "operator");
  await openSection(page, "Marketplace");
  await page
    .getByRole("tab", { name: "Orders & updates", exact: true })
    .click();
  await expect(
    page.getByText("Online payment checkout will open", { exact: false }),
  ).toBeVisible();
  const select = page.getByLabel("Available produce", { exact: true });
  await expect(select).toBeVisible();
  const value = await select.locator("option").nth(1).getAttribute("value");
  await select.selectOption(value!);
  await page.getByLabel("Quantity (kg)", { exact: true }).fill("10");
  await page
    .getByLabel("Collection or delivery request")
    .fill("E2E sample collection request; no payment.");
  await page
    .getByRole("button", { name: "Request order", exact: true })
    .click();
  await expect(
    page
      .locator(".market-order-row")
      .filter({ hasText: "Awaiting seller confirmation" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No payment is taken");
  await dialog
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".market-order-list")).toContainText("Accepted");
  await page
    .getByRole("button", { name: "Cancel request", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Confirm cancellation", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".market-order-list")).toContainText("Cancelled");
  await expect(
    page.getByText("No verified payment updates have been recorded", {
      exact: false,
    }),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
