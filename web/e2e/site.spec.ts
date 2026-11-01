import { expect, test } from "@playwright/test";
import pg from "pg";
import { FILES, openFile, openPuzzle, signIn, submitAndExpect, visible } from "./helpers";

test.describe("puzzle list", () => {
  test("shows every puzzle with its repo and language", async ({ page }) => {
    await page.goto("/");
    const row = visible(page, "puzzle-row-e2e-trace-sequence");
    await expect(row).toContainText("From start to match");
    await expect(row).toContainText("Trace");
    await expect(row).toContainText("Medium");
    await expect(row).toContainText("acme-tiny");
    await expect(row).toContainText("typescript");
  });

  test("filters live in the URL, and survive a reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("combobox", { name: "Type" }).selectOption("trace");
    await expect(page).toHaveURL(/[?&]type=trace/);
    await expect(page.getByRole("row")).toHaveCount(2); // Header and one puzzle.
    await page.reload();
    await expect(visible(page, "puzzle-row-e2e-trace-sequence")).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-find-file")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Type" })).toHaveValue("trace");

    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/type=/);
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();

    await page.getByRole("combobox", { name: "Difficulty" }).selectOption("hard");
    await expect(page).toHaveURL(/difficulty=hard/);
    await expect(visible(page, "puzzle-row-e2e-arch-set")).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-find-symbol")).toHaveCount(0);

    await page.goto("/?tag=config");
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-arch-set")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Tag" })).toHaveValue("config");

    await page.goto("/?repo=acme-tiny&type=find&difficulty=medium");
    await expect(visible(page, "puzzle-row-e2e-find-location")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(2);
  });

  test("a filter matching nothing, or a bad filter value, doesn't break the page", async ({ page }) => {
    await page.goto("/?repo=nothing-here");
    await expect(visible(page, "no-matches")).toBeVisible();
    await page.goto("/?type=bogus");
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
  });

  test("solved state shows per row", async ({ page }) => {
    await openPuzzle(page, "e2e-arch-choice");
    await signIn(page);
    await page.getByRole("radio", { name: "The config module" }).check();
    await submitAndExpect(page, true);
    await page.goto("/");
    await expect(visible(page, "puzzle-row-e2e-arch-choice")).toContainText("Solved");
    await expect(visible(page, "puzzle-row-e2e-find-file")).toContainText("Not started");
  });

  test("works on a phone with no sideways scrolling", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 780 },
      hasTouch: true,
      isMobile: true,
      colorScheme: "dark",
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await expect(visible(page, "puzzle-row-e2e-trace-sequence")).toBeVisible();
      await page.getByRole("combobox", { name: "Type" }).selectOption("trace");
      await expect(page).toHaveURL(/type=trace/);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await context.close();
    }
  });

  test("an empty database explains how to seed it", async ({ page }) => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("update puzzles set published = false");
      await page.goto("/");
      await expect(visible(page, "no-puzzles-seeded")).toContainText("uv run python -m ingest seed");
    } finally {
      await client.query("update puzzles set published = true");
      await client.end();
    }
  });
});

test.describe("dev sign-in and profile", () => {
  test("the header's control is labelled, signs in and signs out", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Local dev sign-in, no account")).toBeVisible();
    await signIn(page);
    await page.reload();
    await expect(visible(page, "signed-in-as")).toHaveText(/^dev-/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(visible(page, "signed-in-as")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Sign in as dev-/ })).toBeVisible();
  });

  test("profile shows solved counts by type and difficulty", async ({ page }) => {
    await page.goto("/profile");
    await expect(visible(page, "profile-signed-out")).toBeVisible();
    await visible(page, "profile-signed-out").getByRole("button", { name: /Local dev sign-in/ }).click();
    await expect(visible(page, "stats-total")).toContainText("0 of 7");

    await openPuzzle(page, "e2e-find-file");
    await openFile(page, FILES.config);
    await visible(page, "pick-open-file").click();
    await submitAndExpect(page, true);

    await page.goto("/profile");
    await expect(visible(page, "stats-total")).toContainText("1 of 7");
    await expect(visible(page, "stats-row-find").locator("td").first()).toHaveText("1");
    await expect(visible(page, "stats-row-trace").locator("td").first()).toHaveText("0");
    await expect(visible(page, "stats-row-easy").locator("td").first()).toHaveText("1");
    await expect(visible(page, "stats-row-hard").locator("td").first()).toHaveText("0");
  });
});
