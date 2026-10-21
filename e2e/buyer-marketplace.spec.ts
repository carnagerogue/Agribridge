import { test, expect, signInAsDemo, openSection } from "./fixtures";

test("a purchasing client requests published produce and the farmer accepts it", async ({
  page,
  consoleErrors,
}) => {
  await signInAsDemo(page, "farmer");
  await openSection(page, "Marketplace");
  await page.getByRole("tab", { name: "My produce", exact: true }).click();
  const supply = page
    .locator(".market-supply-card")
    .filter({ has: page.getByRole("heading", { name: /^Maize/ }) })
    .first();
  await expect(
    supply.getByText("Workspace only", { exact: true }),
  ).toBeVisible();
  await supply
    .getByRole("button", { name: "Publish to buyers", exact: true })
    .click();
  const publication = page.getByRole("dialog", {
    name: "Publish this produce to buyers?",
  });
  await expect(publication).toContainText(
    "Your phone number and private farm records stay in your workspace.",
  );
  await publication
    .getByRole("button", { name: "Confirm publication", exact: true })
    .click();
  await expect(publication).not.toBeVisible();
  await expect(
    supply.getByText("Published to buyers", { exact: true }),
  ).toBeVisible();

  await page.goto("/buy");
  const produce = page.locator(".buyer-produce-card").filter({
    has: page.getByRole("heading", { name: "White maize", exact: true }),
  });
  await expect(produce).toBeVisible();
  await produce.getByRole("button", { name: "Review request" }).click();
  const signup = page.getByRole("dialog", {
    name: "Your next supplier starts here.",
  });
  await signup
    .getByLabel("Your name", { exact: true })
    .fill("Buyer Journey Test");
  await signup
    .getByLabel("Business or organisation (optional)")
    .fill("Sample Journey Kitchen");
  await signup.getByLabel("Uganda phone number").fill("0700999001");
  await signup.getByLabel("District", { exact: true }).fill("Kampala");
  await signup.getByLabel(/^Password/).fill("Demo-buyer-journey-password!");
  await signup
    .getByRole("button", { name: "Create buyer account", exact: true })
    .last()
    .click();

  const review = page.getByRole("dialog", {
    name: "Review your order request",
  });
  await expect(review).toBeVisible();
  await review.getByLabel(/^Quantity \(kg\)/).fill("75");
  await review
    .getByLabel("Delivery or collection location")
    .fill("Kampala · sample collection point");
  await review
    .getByLabel("Message to the seller (optional)")
    .fill(
      "Sample test request. Confirm quality and collection before acceptance.",
    );
  await expect(review).toContainText("UGX 105,000");
  await review
    .getByRole("button", { name: "Send order request", exact: true })
    .click();
  const confirmation = page.getByRole("dialog", {
    name: "Your request is on its way.",
  });
  await expect(confirmation).toContainText("No payment has been collected.");
  await confirmation.getByRole("button", { name: "Track my request" }).click();
  await expect(
    page.locator(".buyer-order-card").filter({ hasText: "75 kg" }),
  ).toContainText("Request sent");

  // The same browser can hold a buyer cookie and a farmer cookie independently.
  await page.goto("/marketplace");
  await page
    .getByRole("tab", { name: "Orders & updates", exact: true })
    .click();
  const order = page
    .locator(".market-client-order")
    .filter({ hasText: "Sample Journey Kitchen" });
  await expect(order).toContainText("75 kg");
  await order.getByRole("button", { name: "Review acceptance" }).click();
  const acceptance = page.getByRole("dialog", {
    name: "Accept this buyer order?",
  });
  await expect(acceptance).toContainText("Acceptance commits this quantity");
  await acceptance
    .getByRole("button", { name: "Confirm acceptance", exact: true })
    .click();
  await expect(acceptance).not.toBeVisible();
  await expect(order).toContainText("Accepted");

  await page.goto("/buy");
  await page.getByRole("button", { name: "My requests", exact: true }).click();
  await expect(
    page.locator(".buyer-order-card").filter({ hasText: "75 kg" }),
  ).toContainText("Seller accepted");
  await expect(
    page.getByRole("button", { name: "Checkout unavailable", exact: true }),
  ).toBeDisabled();
  expect(consoleErrors).toEqual([]);
});

test("the sample buyer walkthrough creates no server account, order or payment", async ({
  page,
  consoleErrors,
}) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/") &&
      !["GET", "HEAD"].includes(request.method())
    )
      mutations.push(request.url());
  });
  await page.goto("/buy");
  await page
    .getByRole("button", { name: "Explore sample marketplace", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Sample marketplace · browser-only preview", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator(".buyer-produce-card")
    .first()
    .getByRole("button", { name: "Review request" })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review a sample order request",
  });
  await review
    .getByRole("button", { name: /sample.*request|Send order request/i })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Track my request|View sample request/i })
    .click();
  const order = page.locator(".buyer-order-card").first();
  await expect(order).toContainText("SAMPLE");
  await order
    .getByRole("button", { name: "Preview seller acceptance" })
    .click();
  await expect(order).toContainText("Seller accepted");
  await order.getByRole("button", { name: "Preview completion" }).click();
  await expect(order).toContainText("Completed");
  expect(mutations).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
