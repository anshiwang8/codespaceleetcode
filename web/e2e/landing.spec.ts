import { expect, test } from "@playwright/test";
import { visible } from "./helpers";

test.describe("landing page", () => {
  test("shows the logo, and Continue as guest goes to the puzzle list", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByTestId("hero");
    await expect(hero.getByTestId("logo")).toBeVisible();
    await expect(page.getByRole("link", { name: "codebases" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("reading real code");

    await hero.getByRole("link", { name: "Continue as guest" }).click();
    await expect(page).toHaveURL(/\/puzzles$/);
    await expect(page.getByRole("heading", { name: "Puzzles", level: 1 })).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
  });

  test("Log in is disabled, says it's coming soon, and goes nowhere", async ({ page }) => {
    await page.goto("/");
    const login = page.getByRole("button", { name: "Log in" });
    await expect(login).toHaveAttribute("aria-disabled", "true");
    await expect(login).toHaveAccessibleDescription("Coming soon");
    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();

    let navigated = false;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigated = true;
    });
    // Playwright won't click an aria-disabled button on its own, so force it, as a user's click would.
    await login.click({ force: true });
    await page.waitForLoadState("networkidle");
    expect(navigated).toBe(false);
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("input[type='password']")).toHaveCount(0);
  });

  test("explains the three puzzle types and repeats the call to action", async ({ page }) => {
    await page.goto("/");
    for (const name of ["Find", "Trace", "Architecture"]) {
      await expect(page.getByRole("heading", { name, level: 3, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Continue as guest" })).toHaveCount(2);
  });

  test("works on a phone with no sideways scrolling", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await expect(page.getByTestId("hero").getByRole("link", { name: "Continue as guest" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });

  test("an old list link with filters goes to /puzzles and keeps them", async ({ page }) => {
    await page.goto("/?difficulty=easy");
    await expect(page).toHaveURL(/\/puzzles\?difficulty=easy$/);
  });
});
