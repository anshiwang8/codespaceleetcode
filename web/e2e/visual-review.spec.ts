import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  browserIssues,
  denseActivity,
  fixtureAccount,
  LONG_REPO,
  ready,
  settled,
  solveEverything,
  withLongRepository,
} from "./visual-helpers";

// Opt-in: the ordinary e2e suite doesn't create a gallery.
test.skip(!process.env.VISUAL_REVIEW, "Run pnpm visual:review");
const phase = process.env.VISUAL_PHASE === "before" ? "before" : "after";
const directory = path.resolve("visual-review", phase);

for (const width of [375, 768, 1440]) {
  test(`stable gallery at ${width}px`, async ({ page }, testInfo) => {
    mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem("cp-dev-login", "dev-visual"));
    const issues = browserIssues(page);
    const captures: string[] = [];
    async function capture(name: string) {
      await ready(page);
      // Trigger each one-time viewport reveal before the full-page layout capture.
      for (const section of await page.locator("[data-reveal]").all()) { await section.scrollIntoViewIfNeeded(); await settled(page); }
      await page.evaluate(() => window.scrollTo(0, 0));
      await settled(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      const targets = await page.locator("header a, header button").evaluateAll((elements) => elements
        .map((element) => element.getBoundingClientRect().toJSON())
        .filter((box) => box.width > 0 && box.height > 0 && box.bottom > 0));
      for (let first = 0; first < targets.length; first++) for (let second = first + 1; second < targets.length; second++) {
        const a = targets[first], b = targets[second];
        const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        expect(overlap, "Header navigation and account controls must not overlap").toBe(false);
      }
      const file = `${name}-${width}.png`;
      await page.screenshot({ path: path.join(directory, file), fullPage: true, animations: "allow" });
      captures.push(file);
    }
    await page.goto("/"); await capture("landing");
    await page.goto("/puzzles"); await capture("puzzles");
    await page.getByRole("combobox", { name: "Type" }).selectOption("trace");
    await expect(page.getByTestId("puzzle-count").filter({ visible: true })).toContainText("1 of 7");
    await capture("puzzles-filtered");
    await page.goto("/puzzles?repo=visual-empty");
    await expect(page.getByTestId("no-matches").filter({ visible: true })).toBeVisible();
    await capture("puzzles-empty");
    await page.goto("/profile");
    await expect(page.getByTestId("profile-signed-out").filter({ visible: true })).toBeVisible();
    await capture("profile-signed-out");
    await fixtureAccount(page);
    await page.goto("/profile");
    await expect(page.getByTestId("stats-total").filter({ visible: true })).toContainText("0 of 7");
    await capture("profile-new");
    await fixtureAccount(page, true, "visual-username-with-39-charactersxxxxx");
    await page.goto("/profile");
    await expect(page.getByTestId("stats-total").filter({ visible: true })).toContainText("1 of 7");
    await capture("profile-populated");
    await page.goto("/settings");
    await expect(page.getByTestId("details-form")).toBeVisible();
    await capture("settings");
    await page.getByTestId("delete-account-start").click();
    await expect(page.getByTestId("delete-account-confirm")).toBeVisible();
    await capture("settings-delete-confirmation");
    expect(issues).toEqual([]);
    writeFileSync(path.join(directory, `gallery-${width}.json`), JSON.stringify({ localInstance: new URL(page.url()).origin, width, captures, issues }, null, 2));
    await testInfo.attach("gallery", { body: captures.join("\n"), contentType: "text/plain" });
  });
}

for (const width of [375, 768, 1440]) {
  test(`profile activity gallery at ${width}px`, async ({ page }) => {
    mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    const issues = browserIssues(page);
    async function capture(name: string) {
      await ready(page);
      await settled(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(directory, `${name}-${width}.png`), fullPage: true, animations: "allow" });
    }
    const login = `visual-dense-${width}`;
    await fixtureAccount(page, false, login);
    await denseActivity(login);
    await page.goto("/profile");
    await expect(page.getByTestId("streak-current").filter({ visible: true })).not.toHaveText("0 days");
    await capture("profile-activity-dense");

    // A past calendar year, the year before this one.
    const lastYear = String(new Date().getUTCFullYear() - 1);
    await page.getByTestId("activity-period").selectOption(lastYear);
    await expect(page.getByTestId("activity-summary")).toHaveText(new RegExp(`^${lastYear}: `));
    await capture("profile-activity-year");
    await page.getByTestId("activity-period").selectOption("rolling");
    await expect(page.getByTestId("activity-summary")).toHaveText(/^Last 365 days: /);

    // Five days back is an empty day in the fixture: pick it by keyboard, leaving its focus ring.
    const start = page.locator('[data-testid=activity-grid] [role=gridcell][tabindex="0"]');
    await start.focus();
    for (let step = 0; step < 5; step++) await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("history-no-matches").filter({ visible: true })).toBeVisible();
    await page.getByTestId("activity").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(directory, `profile-selected-day-${width}.png`), fullPage: true, animations: "allow" });

    // Loading another period: the shown calendar dims and stays until the new one arrives.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/me/activity**", async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    await page.getByTestId("activity-period").selectOption(lastYear);
    await expect(page.getByTestId("activity-scroll")).toHaveAttribute("aria-busy", "true");
    await page.getByTestId("activity").screenshot({ path: path.join(directory, `profile-period-loading-${width}.png`) });
    release();
    await expect(page.getByTestId("activity-summary")).toHaveText(new RegExp(`^${lastYear}: `));
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.getByTestId("activity-period").selectOption("rolling");
    await expect(page.getByTestId("activity-summary")).toHaveText(/^Last 365 days: /);

    // Failures that recover: both are deliberate, so they're left out of the browser-issue check.
    const before = issues.length;
    await page.route("**/api/me/activity**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.getByTestId("activity-period").selectOption(lastYear);
    await expect(page.getByTestId("activity-error").filter({ visible: true })).toBeVisible();
    await page.route("**/api/me/history**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.getByRole("combobox", { name: "Difficulty" }).selectOption("medium");
    await expect(page.getByTestId("history-error").filter({ visible: true })).toBeVisible();
    await capture("profile-recoverable-errors");
    await page.unrouteAll({ behavior: "ignoreErrors" });
    issues.length = before;

    // Sparse: one submission, every puzzle solved, and a repository with a very long name.
    const allLogin = `visual-all-solved-${width}`;
    await fixtureAccount(page, false, allLogin);
    await solveEverything(allLogin);
    await withLongRepository(allLogin, async () => {
      await page.goto("/profile");
      await expect(page.getByTestId("profile-summary").filter({ visible: true })).toContainText("87%"); // 7 of 8, rounded down
      await expect(page.getByText(LONG_REPO).first()).toBeVisible();
      await capture("profile-long-names-sparse");
    });
    await page.goto("/profile");
    await expect(page.getByTestId("summary-completion").filter({ visible: true })).toContainText("100%");
    await capture("profile-all-solved");
    expect(issues).toEqual([]);
  });
}

test("workspace gallery at laptop size", async ({ page }) => {
  mkdirSync(directory, { recursive: true });
  const issues = browserIssues(page);
  await fixtureAccount(page, false, "visual-workspace");
  await page.goto("/puzzles/e2e-arch-choice");
  await ready(page);
  await expect(page.locator(".monaco-editor .view-line").first()).toBeVisible();
  async function capture(name: string) {
    await settled(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    // Only public choice labels and synthetic fixture code appear. Unlocked solution body is masked.
    await page.screenshot({ path: path.join(directory, `workspace-${name}.png`), animations: "allow",
      mask: [page.getByTestId("solution")] });
  }
  await page.getByTestId("prompt-tab-solution").click();
  await capture("locked");
  await page.getByTestId("prompt-tab-description").click();
  await page.getByRole("radio", { name: "The router module" }).check();
  await capture("selected");
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("result")).toHaveAttribute("data-correct", "false");
  await capture("incorrect");
  await page.getByRole("radio", { name: "The config module" }).check();
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("result")).toHaveAttribute("data-correct", "true");
  await capture("correct");
  await page.getByTestId("view-solution").click();
  await expect(page.getByTestId("solution")).toHaveAttribute("data-state", "ready");
  await capture("unlocked");
  expect(issues).toEqual([]);
});
