import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { browserIssues, fixtureAccount, ready, settled } from "./visual-helpers";

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
    await page.getByTestId("delete-account-start").click();
    await expect(page.getByTestId("delete-account-confirm")).toBeVisible();
    await capture("profile-delete-confirmation");
    expect(issues).toEqual([]);
    writeFileSync(path.join(directory, `gallery-${width}.json`), JSON.stringify({ localInstance: new URL(page.url()).origin, width, captures, issues }, null, 2));
    await testInfo.attach("gallery", { body: captures.join("\n"), contentType: "text/plain" });
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
