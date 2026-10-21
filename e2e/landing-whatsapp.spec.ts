import { expect, test } from "./fixtures.ts";

test("a visitor explores both sides of the marketplace and the farmer WhatsApp journey", async ({
  page,
  consoleErrors,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Meet good buyers.",
  );
  await expect(
    page.locator(".lp-hero-actions").getByRole("link", { name: "Buy produce" }),
  ).toHaveAttribute("href", "/buy");
  await expect(
    page
      .locator(".lp-hero-actions")
      .getByRole("link", { name: "Sell produce" }),
  ).toHaveAttribute("href", "/whatsapp-demo?audience=farmer");
  await expect(page.locator("#marketplace")).toContainText(
    "Illustrative listings · not live inventory",
  );
  await page
    .getByRole("link", { name: "See how it works", exact: true })
    .click();
  await expect(page).toHaveURL(/#how-it-works$/);
  const journey = page.getByRole("group", {
    name: "Explore the WhatsApp journey",
  });
  const preview = page.locator("#landing-whatsapp-preview");
  await expect(page.getByRole("tab", { name: /I’m a farmer/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(preview.locator(".lwh-whatsapp-brand")).toContainText(
    "WhatsApp",
  );
  await expect(preview.locator(".lwh-whatsapp-brand")).toContainText(
    "Mock conversation",
  );
  await expect(preview.locator(".lwh-bubble")).toHaveCount(3);
  await expect(preview).toContainText("I’m Grace at Demo Farm in Kiwoko");
  await expect(preview.locator(".lwh-mock-note")).toContainText(
    "no messages sent",
  );
  await expect(preview).toContainText("Sample business profile");
  await expect(page.locator("#how-it-works")).toContainText(
    "WhatsApp connection coming soon",
  );
  for (const step of [
    { name: "Bring your harvest to market", expected: "Sample buyer request" },
    { name: "Ask before you decide", expected: "Sample market briefing" },
    { name: "Know where your order stands", expected: "Sample payment events" },
  ]) {
    const control = journey.getByRole("button", {
      name: new RegExp(step.name),
    });
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(preview).toContainText(step.expected);
  }
  await expect(preview).toContainText("Payment approved");
  await expect(preview).toContainText("Provider confirmation pending");
  await expect(preview).toContainText("No money has moved");
  const first = journey.getByRole("button", { name: /Start with your number/ });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(preview).toContainText("Sample business profile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("#how-it-works")
    .getByRole("link", { name: "Try the farmer conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/whatsapp-demo\?audience=farmer$/);
  expect(consoleErrors).toEqual([]);
});

test("a purchasing client can switch to the buyer chat and follow procurement through pending payment", async ({
  page,
  consoleErrors,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome#how-it-works");
  const farmer = page.getByRole("tab", { name: /I’m a farmer/ });
  const buyer = page.getByRole("tab", { name: /I’m a buyer/ });
  await farmer.focus();
  await page.keyboard.press("ArrowRight");
  await expect(buyer).toBeFocused();
  await expect(buyer).toHaveAttribute("aria-selected", "true");
  const preview = page.locator("#landing-whatsapp-preview");
  await expect(preview).toContainText("buying 1,000 kg of white maize");
  await expect(preview.locator(".lwh-bubble")).toHaveCount(3);
  const journey = page.getByRole("group", {
    name: "Explore the WhatsApp journey",
  });
  for (const step of [
    {
      name: "Make a clear purchase request",
      expected: "Awaiting seller acceptance",
    },
    {
      name: "Agree directly with the seller",
      expected: "Terms accepted · example only",
    },
    {
      name: "Follow payment and collection",
      expected: "Provider confirmation pending",
    },
  ]) {
    await journey.getByRole("button", { name: new RegExp(step.name) }).click();
    await expect(preview).toContainText(step.expected);
  }
  await expect(preview).toContainText("No money has moved");
  await expect(
    page.getByRole("link", { name: "Prefer the web? Browse produce" }),
  ).toHaveAttribute("href", "/buy");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Try the buyer conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/whatsapp-demo\?audience=buyer$/);
  expect(consoleErrors).toEqual([]);
});
