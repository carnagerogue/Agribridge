import { expect, test } from "./fixtures.ts";

test("the public WhatsApp preview creates only a sample profile and offer", async ({
  page,
  consoleErrors,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/whatsapp-demo");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "To your next buyer.",
  );
  const replies = page.locator(".wd-quick-replies");
  for (const label of [
    "Demo farmer",
    "Demo Farm",
    "Kiwoko, Nakaseke",
    "Maize",
    "White maize",
    "3.5 acres",
    "600 kg",
    "Ready in two weeks",
  ])
    await replies.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("log")).toContainText("600 kg");
  await replies
    .getByRole("button", { name: "Confirm sample profile", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your confirmed sample profile" }),
  ).toBeVisible();
  await replies
    .getByRole("button", { name: "Find a buyer", exact: true })
    .click();
  await replies
    .getByRole("button", { name: "Create sample offer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your sample offer", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wd-offer-note")).toContainText(
    "not been published or sent",
  );
  await page.reload();
  await expect(
    replies.getByRole("button", { name: "Demo farmer", exact: true }),
  ).toBeVisible();
  expect(apiRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("payment examples distinguish approval from received funds without contacting a provider", async ({
  page,
  consoleErrors,
}) => {
  await page.goto("/whatsapp-demo");
  const scenarios = page.getByRole("region", {
    name: "Choose a conversation example",
  });
  await scenarios.getByRole("button", { name: /Payment updates/ }).click();
  await expect(page.getByRole("log")).toContainText(
    "transfer is not yet confirmed",
  );
  await page
    .getByRole("button", {
      name: "Show confirmed-payment example",
      exact: true,
    })
    .click();
  await expect(page.getByRole("log")).toContainText("Payment received");
  await expect(page.getByRole("log")).toContainText(
    "No real transfer or notification has occurred",
  );
  await page.getByRole("button", { name: /Luganda.*preview/ }).click();
  await expect(page.getByRole("log")).toHaveAttribute("lang", "lg");
  await expect(page.getByText(/needs native-speaker review/)).toBeVisible();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Try a scripted voice-note example",
      exact: true,
    })
    .click();
  await expect(page.getByRole("log")).toContainText(
    "Scripted voice-note transcript",
  );
  await expect(
    page.getByText(
      "Transcript only. No microphone, audio playback or speech recognition is used.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
