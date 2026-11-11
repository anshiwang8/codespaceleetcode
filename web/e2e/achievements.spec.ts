import { expect, test, type Page } from "@playwright/test";
import { visible } from "./helpers";
import { ACHIEVEMENTS } from "../lib/achievements";

/** Signs in with the dev login under a chosen name, through the same route the header button uses. */
async function devLogin(page: Page, login: string): Promise<void> {
  const base = test.info().project.use.baseURL ?? "";
  const response = await page.request.post("/api/dev/login", { data: { login }, headers: { origin: base } });
  expect(response.ok()).toBe(true);
}

function uniqueLogin(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
}

const LISTED = ACHIEVEMENTS.filter((achievement) => !achievement.retired).length;

test.describe("achievements on the profile", () => {
  test("a new account sees every achievement locked, with progress, and a working filter", async ({ page }) => {
    await devLogin(page, uniqueLogin("badges"));
    await page.goto("/profile#achievements");
    const section = visible(page, "achievements");
    await expect(section).toBeInViewport();
    await expect(section.getByTestId("achievements-summary")).toHaveText(`0 of ${LISTED} earned`);
    for (const label of ["Getting started", "Difficulty", "Consistency", "Mastery", "Challenges"]) {
      await expect(section.getByRole("heading", { level: 3, name: label })).toBeVisible();
    }
    const comfortable = section.getByTestId("achievement-getting-comfortable");
    await expect(comfortable).toHaveAttribute("data-earned", "false");
    await expect(comfortable.getByTestId("achievement-state")).toContainText("Locked");
    await expect(comfortable.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "0 of 5");

    // Toggle buttons, reachable and pressable from the keyboard.
    const earned = section.getByTestId("achievements-filter-earned");
    await earned.focus();
    await page.keyboard.press("Enter");
    await expect(earned).toHaveAttribute("aria-pressed", "true");
    await expect(section.getByTestId("achievements-filter-all")).toHaveAttribute("aria-pressed", "false");
    await expect(section.getByTestId("achievements-empty")).toContainText("haven't earned an achievement yet");
    await section.getByTestId("achievements-filter-locked").focus();
    await page.keyboard.press("Space");
    await expect(section.getByTestId("achievement-first-steps")).toBeVisible();
    await expect(section.getByTestId("achievements-empty")).toHaveCount(0);
  });

  test("solving a puzzle first time earns its achievements, dated in UTC", async ({ page }) => {
    await devLogin(page, uniqueLogin("earner"));
    const base = test.info().project.use.baseURL ?? "";
    const submit = await page.request.post("/api/puzzles/e2e-arch-choice/submit", {
      data: { kind: "choice", option: "config" },
      headers: { origin: base },
    });
    expect(submit.ok()).toBe(true);
    const result = (await submit.json()) as { correct: boolean; achievements: { id: string }[] };
    expect(result.correct).toBe(true);
    expect(result.achievements.map((a) => a.id)).toEqual(expect.arrayContaining(["first-steps", "first-try-success"]));

    await page.goto("/profile#achievements");
    const section = visible(page, "achievements");
    for (const id of ["first-steps", "first-try-success"]) {
      const badge = section.getByTestId(`achievement-${id}`);
      await expect(badge).toHaveAttribute("data-earned", "true");
      await expect(badge.getByTestId("achievement-state")).toHaveText(/^Earned [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    }
    await expect(section.getByTestId("achievements-summary")).toHaveText(new RegExp(`^[2-9] of ${LISTED} earned$`));

    await section.getByTestId("achievements-filter-earned").click();
    await expect(section.getByTestId("achievement-first-steps")).toBeVisible();
    await expect(section.getByTestId("achievement-code-explorer")).toHaveCount(0);
  });

  test("on a phone the achievements fit the screen", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await devLogin(page, uniqueLogin("badges-phone"));
      await page.goto("/profile#achievements");
      await expect(visible(page, "achievements")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });
});
