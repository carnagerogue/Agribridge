import type { Page } from "@playwright/test";
import { SECURE_ADMIN, SECURE_BASE_URL, SECURE_FARMER } from "./accounts.ts";
import { currentStep, totpCode } from "../server/mfa.ts";
import { expect, test } from "./fixtures.ts";

// A server without demo mode, where administrators need two-factor sign-in.
test.use({ baseURL: SECURE_BASE_URL });

async function signInWithPassword(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(SECURE_ADMIN.email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(SECURE_ADMIN.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("an administrator sets up two-factor sign-in, then needs a code to sign in", async ({
  page,
  context,
  consoleErrors,
}) => {
  await signInWithPassword(page);
  await expect(
    page.getByRole("heading", { name: "Protect administrator access." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set up two-factor sign-in" }).click();
  const key = (await page.getByLabel("Setup key").textContent())!.replaceAll(
    " ",
    "",
  );
  await page
    .getByLabel("6-digit code from the app")
    .fill(totpCode(key, currentStep()));
  await page
    .getByRole("button", { name: "Turn on two-factor sign-in" })
    .click();
  await expect(
    page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem"),
  ).toHaveCount(8);
  await page.getByRole("button", { name: "I have saved these codes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Hello, Esther.",
  );

  // A new browser session must pass the second step, with a fresh code.
  await context.clearCookies();
  await signInWithPassword(page);
  await page
    .getByLabel("Authentication code")
    .fill(totpCode(key, currentStep() + 1));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Hello, Esther.",
  );
  expect(consoleErrors).toEqual([]);
});

test("a farmer resets a forgotten password with a code sent by SMS", async ({
  page,
  request,
  consoleErrors,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await page.getByLabel("Mobile number").fill(SECURE_FARMER.phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(/If an account uses this number/)).toBeVisible();
  let code = "";
  await expect
    .poll(async () => {
      const sent = (await (
        await request.get(`${SECURE_BASE_URL}/__e2e/sms`)
      ).json()) as { to: string; message: string }[];
      code =
        sent
          .filter((message) => message.to === SECURE_FARMER.phone)
          .at(-1)
          ?.message.match(/\b(\d{6})\b/)?.[1] ?? "";
      return code;
    })
    .toMatch(/^\d{6}$/);
  const newPassword = "a fresh farmer passphrase";
  await page.getByLabel("Code from SMS").fill(code);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Hello, Robert.",
  );
  expect(consoleErrors).toEqual([]);
});
