import { expect, test } from "./fixtures.ts";

test("a public buyer can try sourcing and distinct payment examples, stop, and return to the farmer demo without an API call", async ({
  page,
  consoleErrors,
}) => {
  const apiRequests: { method: string; path: string }[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/"))
      apiRequests.push({ method: request.method(), path });
  });
  await page.goto("/whatsapp-demo?audience=buyer");
  await expect(page).toHaveURL(/\/whatsapp-demo\?audience=buyer$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "From the right grower.",
  );
  await expect(
    page.getByText("A scripted buyer demonstration.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buyer · source produce", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  const replies = page.getByLabel("Buyer sample replies", { exact: true });
  for (const label of [
    "AGREE",
    "Demo buyer",
    "Sample Kampala Foods",
    "Kampala",
    "Maize",
    "600 kg",
    "To agree after inspection",
    "Within two weeks",
  ]) {
    await replies.getByRole("button", { name: label, exact: true }).click();
  }
  const log = page.getByRole("log", {
    name: "Scripted buyer WhatsApp conversation",
  });
  await expect(log).toContainText("Quantity: 600 kg");
  await expect(
    page.getByRole("region", { name: "Matching sample produce offers" }),
  ).toHaveCount(0);
  await replies
    .getByRole("button", { name: "Confirm sample request", exact: true })
    .click();
  const offers = page.getByRole("region", {
    name: "Matching sample produce offers",
  });
  await expect(offers).toContainText("Sample Nakaseke Growers");
  await expect(offers).toContainText("Fictional availability");
  await replies
    .getByRole("button", {
      name: "Review Sample Nakaseke Growers",
      exact: true,
    })
    .click();
  await expect(log).toContainText("SAMPLE produce subtotal UGX 930,000");
  await expect(log).toContainText(
    "does not reserve stock or authorise payment",
  );
  await replies
    .getByRole("button", { name: "Request sample order", exact: true })
    .click();
  await expect(log).toContainText("No produce is reserved");
  await replies
    .getByRole("button", {
      name: "Show seller-confirmation example",
      exact: true,
    })
    .click();
  await replies
    .getByRole("button", { name: "Show payment-approval example", exact: true })
    .click();
  await expect(log).toContainText("receipt is not yet confirmed");
  await expect(log).not.toContainText("SAMPLE payment received");
  await expect(log).toContainText("pay the verified seller directly");
  await replies
    .getByRole("button", {
      name: "Show confirmed-payment example",
      exact: true,
    })
    .click();
  await expect(log).toContainText(
    "No actual transfer or WhatsApp notification occurred",
  );
  await expect(log).toContainText(
    "A delivered message alone never proves payment",
  );

  const composer = page.getByRole("textbox", {
    name: "Type a sample buyer reply",
  });
  await composer.fill("STOP");
  await page
    .getByRole("button", { name: "Send buyer demo reply", exact: true })
    .click();
  await expect(composer).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Try a scripted buyer voice-note example",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Reset buyer demo", exact: true })
    .click();
  await expect(composer).toBeEnabled();
  await expect(
    replies.getByRole("button", { name: "AGREE", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Farmer · sell produce", exact: true })
    .click();
  await expect(page).toHaveURL(/\/whatsapp-demo$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "To your next buyer.",
  );
  await expect(
    page.getByRole("button", { name: "Farmer · sell produce", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(apiRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
