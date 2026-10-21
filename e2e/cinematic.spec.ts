import { devices, type Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const scenes = [
  {
    label: "growing",
    image: "fields",
    heading: /Good harvests\.\s*Meet good buyers\./,
  },
  {
    label: "harvesting",
    image: "harvest",
    heading: /Know the source\.\s*Choose your supply\./,
  },
  {
    label: "transporting",
    image: "transport",
    heading: /From farm gate\.\s*Plan the journey\./,
  },
  {
    label: "selling",
    image: "market",
    heading: /Agree the terms\.\s*Grow together\./,
  },
] as const;

/** Check actual decoded photography, not merely a successful image request. */
async function expectScene(page: Page, index: number) {
  const scene = scenes[index];
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    scene.heading,
  );
  await expect(
    page.getByRole("button", {
      name: `Show ${scene.label} scene`,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const frame = page.locator(`.lp-film-frame[data-scene="${index}"]`);
  await expect
    .poll(
      () =>
        frame.evaluate((element) => {
          const image = element.querySelector("img");
          return (
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0 &&
            Number(getComputedStyle(element).opacity) > 0.95
          );
        }),
      { message: `${scene.label} photography should be decoded and visible` },
    )
    .toBe(true);
  await expect
    .poll(() =>
      frame
        .locator("img")
        .evaluate((image: HTMLImageElement) => image.currentSrc),
    )
    .toMatch(
      new RegExp(`/images/agribridge-${scene.image}-(640|1024|1536)\\.webp$`),
    );
}

/** Scroll the page as the visitor does, through the full pinned sequence. */
async function scrollToScene(page: Page, index: number) {
  const distance = await page
    .locator(".lp-film-story")
    .evaluate((region, step) => {
      const hero = region.querySelector<HTMLElement>(".lp-hero");
      if (!hero) throw new Error("The cinematic hero is missing");
      const range = region.clientHeight - hero.offsetHeight;
      if (range <= 0)
        throw new Error("The cinematic scroll sequence has no range");
      return region.getBoundingClientRect().top + (range * step) / 3;
    }, index);
  await page.mouse.wheel(0, distance);
  await expectScene(page, index);
}

async function expectCinematicMotion(page: Page) {
  await expect(page.locator(".lp-film-story .lp-hero")).toHaveCSS(
    "position",
    "sticky",
  );
  await expect
    .poll(() =>
      page.locator(".lp-film-story").evaluate((region) => {
        const hero = region.querySelector<HTMLElement>(".lp-hero");
        return hero ? region.clientHeight / hero.offsetHeight : 0;
      }),
    )
    .toBeGreaterThan(3);
  const openingImage = page.locator('.lp-film-frame[data-scene="0"] img');
  await expect(openingImage).not.toHaveCSS("animation-name", "none");
  await expect(openingImage).toHaveCSS("animation-play-state", "running");
}

for (const profile of [
  {
    name: "desktop",
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    userAgent: devices["Desktop Chrome"].userAgent,
  },
  {
    name: "phone",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: devices["Moto G4"].userAgent,
  },
]) {
  test.describe(`cinematic landing on ${profile.name}`, () => {
    test.use({
      viewport: profile.viewport,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      userAgent: profile.userAgent,
    });

    test("a fresh visitor can scroll forward and backward through four illustrated chapters", async ({
      page,
      consoleErrors,
    }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto("/");
      await expectScene(page, 0);
      await expect(
        page.getByRole("button", { name: "Pause animations", exact: true }),
      ).toBeVisible();
      await expectCinematicMotion(page);

      for (const index of [1, 2, 3, 2, 1, 0]) await scrollToScene(page, index);

      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        )
        .toBeLessThanOrEqual(0);
      expect(consoleErrors).toEqual([]);
    });

    test("reduced motion keeps every scene accessible and allows explicit cinematic playback", async ({
      page,
      consoleErrors,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/welcome");
      await expectScene(page, 0);
      const enableMotion = page.getByRole("button", {
        name: "Enable cinematic motion",
        exact: true,
      });
      await expect(enableMotion).toBeVisible();

      // The system preference is respected until the visitor explicitly opts in.
      await expect(page.locator(".lp-film-story .lp-hero")).not.toHaveCSS(
        "position",
        "sticky",
      );
      for (const index of [1, 2, 3, 0]) {
        await page
          .getByRole("button", {
            name: `Show ${scenes[index].label} scene`,
            exact: true,
          })
          .click();
        await expectScene(page, index);
      }

      await enableMotion.click();
      const pause = page.getByRole("button", {
        name: "Pause animations",
        exact: true,
      });
      await expect(pause).toBeVisible();
      await expectCinematicMotion(page);
      await scrollToScene(page, 1);
      await scrollToScene(page, 2);
      await scrollToScene(page, 3);
      await scrollToScene(page, 2);

      await pause.click();
      const resume = page.getByRole("button", {
        name: "Resume animations",
        exact: true,
      });
      await expect(resume).toBeVisible();
      await expect(page.locator(".lp-film-story .lp-hero")).not.toHaveCSS(
        "position",
        "sticky",
      );
      await expectScene(page, 2);
      await expect(page.locator(".lp-film-story .lp-hero")).toBeInViewport({
        ratio: 0.9,
      });
      await resume.click();
      await expect(pause).toBeVisible();
      await expectCinematicMotion(page);
      await expectScene(page, 2);
      await expect(page.locator(".lp-film-story .lp-hero")).toBeInViewport({
        ratio: 0.9,
      });
      await scrollToScene(page, 1);
      expect(consoleErrors).toEqual([]);
    });
  });
}
