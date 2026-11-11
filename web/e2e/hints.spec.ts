import { expect, test } from "@playwright/test";
import { FILES, openFile, openPuzzle, signIn, submitAndExpect, visible } from "./helpers";

// Most fixture puzzles have these two hints (web/e2e/fixtures/seed.mjs); e2e-design-choice has three, e2e-arch-choice one.
const HINT_1 = "Start from the entry point.";
const HINT_2 = "Follow the call into the router.";

test.describe("progressive hints", () => {
  test("signed out, it shows the count and a sign-in prompt, and no hint text", async ({ page }) => {
    const hintRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/hints")) hintRequests.push(request.url());
    });
    await openPuzzle(page, "e2e-find-symbol");

    const panel = visible(page, "hints");
    await expect(panel.getByTestId("hint-count")).toHaveText("2 hints");
    await expect(panel.getByTestId("sign-in-prompt")).toContainText(
      "Sign in to reveal hints. Revealed hints are saved to your account.",
    );
    await expect(panel.getByRole("button", { name: /Local dev sign-in/ })).toBeVisible();
    await expect(page.getByTestId("hint")).toHaveCount(0);
    await expect(page.getByTestId("reveal-hint")).toHaveCount(0);

    // Not on screen, and not anywhere in what the server sent.
    const html = await page.content();
    expect(html).not.toContain(HINT_1);
    expect(html).not.toContain(HINT_2);
    expect(hintRequests).toEqual([]);
  });

  test("signed in, levels reveal in order, with labels, focus and the cost explained", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    const panel = visible(page, "hints");
    await expect(panel.getByTestId("hint-count")).toHaveText("0 of 2 hints revealed");
    await expect(panel.getByTestId("hint-cost")).toHaveText(
      "Each hint revealed before you solve takes 20 points off this puzzle's score.",
    );

    await panel.getByRole("button", { name: "Reveal hint 1" }).click();
    const hints = panel.getByTestId("hint");
    await expect(hints).toHaveCount(1);
    await expect(hints.nth(0)).toBeFocused();
    await expect(hints.nth(0).getByTestId("hint-label")).toHaveText("Level 1 Direction");
    await expect(hints.nth(0)).toContainText(HINT_1);
    await expect(panel.getByTestId("hint-count")).toHaveText("1 of 2 hints revealed");
    await expect(panel.getByTestId("hint-announcement")).toHaveText("Hint 1 of 2 revealed: Direction.");

    await panel.getByRole("button", { name: "Reveal hint 2" }).click();
    await expect(hints).toHaveCount(2);
    await expect(hints.nth(1)).toBeFocused();
    await expect(hints.nth(1).getByTestId("hint-label")).toHaveText("Level 2 Narrow the search");
    await expect(hints.nth(1)).toContainText(HINT_2);
    await expect(panel.getByTestId("hint-count")).toHaveText("2 of 2 hints revealed");

    // No level past the ones that exist, and nothing left to warn about.
    await expect(panel.getByTestId("reveal-hint")).toHaveCount(0);
    await expect(panel.getByTestId("hint-cost")).toHaveCount(0);
    await expect(panel).not.toContainText("Guided reasoning");
  });

  test("a three-level puzzle ends with guided reasoning", async ({ page }) => {
    await openPuzzle(page, "e2e-design-choice");
    await signIn(page);
    const panel = visible(page, "hints");
    for (const level of [1, 2, 3]) await panel.getByRole("button", { name: `Reveal hint ${level}` }).click();
    const hints = panel.getByTestId("hint");
    await expect(hints).toHaveCount(3);
    await expect(hints.nth(2).getByTestId("hint-label")).toHaveText("Level 3 Guided reasoning");
    await expect(hints.nth(2)).toContainText("Compare where each option says the limits live");
    await expect(panel.getByTestId("hint-count")).toHaveText("3 of 3 hints revealed");
    await expect(panel.getByTestId("reveal-hint")).toHaveCount(0);
  });

  test("a one-hint puzzle shows a plain hint, with no levels", async ({ page }) => {
    await openPuzzle(page, "e2e-arch-choice");
    await signIn(page);
    const panel = visible(page, "hints");
    await expect(panel.getByTestId("hint-count")).toHaveText("0 of 1 hint revealed");
    await panel.getByRole("button", { name: "Reveal hint", exact: true }).click();
    await expect(panel.getByTestId("hint")).toHaveCount(1);
    await expect(panel.getByTestId("hint-label")).toHaveText("Hint");
    await expect(panel).not.toContainText("Level 1");
  });

  test("revealed hints come back after a reload", async ({ page }) => {
    await openPuzzle(page, "e2e-find-file");
    await signIn(page);
    await visible(page, "hints").getByRole("button", { name: "Reveal hint 1" }).click();
    await expect(page.getByTestId("hint")).toHaveCount(1);

    await page.reload();
    await expect(page.getByTestId("file-tree")).toBeVisible();
    const panel = visible(page, "hints");
    await expect(panel.getByTestId("hint")).toHaveCount(1);
    await expect(panel.getByTestId("hint")).toContainText(HINT_1);
    await expect(panel.getByTestId("hint-count")).toHaveText("1 of 2 hints revealed");
    await expect(panel.getByRole("button", { name: "Reveal hint 2" })).toBeEnabled();
  });

  test("a failed reveal says what to do, and keeps the button", async ({ page }) => {
    await openPuzzle(page, "e2e-find-location");
    await signIn(page);
    await page.route("**/api/puzzles/*/hints", (route) =>
      route.fulfill({ status: 429, json: { error: "Too many requests. Try again in a minute." } }),
    );
    const panel = visible(page, "hints");
    await panel.getByRole("button", { name: "Reveal hint 1" }).click();
    await expect(panel.getByRole("alert")).toHaveText(
      "Too many hints requested in a short time. Wait a minute, then try again.",
    );
    await expect(page.getByTestId("hint")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Reveal hint 1" })).toBeEnabled();
  });

  test("the server refuses a level out of order", async ({ page }) => {
    await openPuzzle(page, "e2e-trace-sequence");
    await signIn(page);
    const base = test.info().project.use.baseURL ?? "";
    const response = await page.request.post("/api/puzzles/e2e-trace-sequence/hints", {
      data: { level: 2 },
      headers: { origin: base },
    });
    expect(response.status()).toBe(409);
    expect(await response.text()).not.toContain(HINT_2);
  });

  test("a solve shows its points and unlocks an achievement toast; hints then cost nothing", async ({ page }) => {
    await openPuzzle(page, "e2e-find-file");
    await signIn(page);
    await visible(page, "hints").getByRole("button", { name: "Reveal hint 1" }).click();
    await expect(page.getByTestId("hint")).toHaveCount(1);

    await openFile(page, FILES.config);
    await page.getByTestId("pick-open-file").click();
    await submitAndExpect(page, true);

    // Easy (100) + first try (25) - one hint (20), plus any challenge bonus listed under it.
    const points = page.getByTestId("result-points");
    await expect(points).toHaveText(/^\+\d+ points$/);
    const earned = Number((await points.textContent())?.replace(/\D/g, ""));
    const bonuses = await page.getByTestId("result-challenges").locator("li").allTextContents();
    const bonusTotal = bonuses.reduce((sum, line) => sum + Number(line.match(/\+(\d+)$/)?.[1] ?? 0), 0);
    expect(earned).toBe(105 + bonusTotal);

    // The first solve unlocks "First Steps", announced in a toast that links to the profile.
    const toast = page.getByTestId("toast").filter({ hasText: "First Steps" });
    await expect(toast).toBeVisible();
    await expect(toast.getByRole("link", { name: "See your achievements" })).toHaveAttribute(
      "href",
      "/profile#achievements",
    );
    await expect(page.getByTestId("toasts")).toHaveAttribute("aria-live", "polite");
    // It doesn't cover Submit at 1366x800.
    const toastBox = await toast.boundingBox();
    const submitBox = await page.getByTestId("submit").boundingBox();
    expect(toastBox && submitBox).toBeTruthy();
    if (toastBox && submitBox) expect(toastBox.x + toastBox.width).toBeLessThan(submitBox.x);
    await toast.getByRole("button", { name: "Dismiss: First Steps" }).click();
    await expect(toast).toHaveCount(0);

    await expect(visible(page, "hints").getByTestId("hint-cost")).toHaveText(
      "You've solved this puzzle, so hints no longer affect its score.",
    );
  });
});
