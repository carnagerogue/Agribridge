import { expect, test } from "./fixtures.ts";

test("a visitor explores the intended WhatsApp journey from the landing page", async ({
  page,
  consoleErrors,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/welcome");
  await page
    .getByRole("link", { name: "See how it works", exact: true })
    .click();
  await expect(page).toHaveURL(/#how-it-works$/);
  const journey = page.getByRole("group", {
    name: "Explore the WhatsApp journey",
  });
  const preview = page.locator("#landing-whatsapp-preview");
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
    { name: "Stay in the loop on payment", expected: "Sample payment events" },
  ]) {
    const control = journey.getByRole("button", {
      name: new RegExp(step.name),
    });
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await expect(preview).toContainText(step.expected);
  }
  await expect(preview).toContainText("Payment approved");
  await expect(preview).toContainText("Transfer awaiting confirmation");
  await expect(preview).toContainText("Payment received");
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
    .getByRole("link", { name: "Try the conversation demo", exact: true })
    .click();
  await expect(page).toHaveURL(/\/whatsapp-demo$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "To your next buyer.",
  );
  expect(consoleErrors).toEqual([]);
});
