import { expect, test } from "@playwright/test";
import {
  cursorOnSymbol,
  FILES,
  openFile,
  openPuzzle,
  selectLines,
  signIn,
  submitAndExpect,
  visible,
} from "./helpers";

// One test per answer kind, across all three puzzle types, solved only by clicking.

test.describe("solving", () => {
  test("Find with a symbol, from the symbol under the cursor", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    await expect(page.getByTestId("tray-empty")).toBeVisible();
    await expect(page.getByTestId("submit")).toBeDisabled();

    await openFile(page, FILES.router);
    await cursorOnSymbol(page, "match(path: string)", "match", "src/router.ts#Router.match");
    await page.getByTestId("pick-cursor-symbol").click();
    await expect(page.getByTestId("selected-answer")).toHaveText("src/router.ts#Router.match");

    await submitAndExpect(page, true);
    await expect(page.getByTestId("result")).toContainText("Attempt 1");
    await expect(page.getByTestId("puzzle-status")).toHaveText("Solved");
    await page.getByTestId("view-solution").click();
    await expect(page.getByTestId("solution")).toContainText("SOLUTIONTOKEN");
  });

  test("Find with a symbol, from an outline row", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    await openFile(page, FILES.router);
    await page
      .locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router.match"]')
      .click();
    await expect(page.getByTestId("selected-answer")).toHaveText("src/router.ts#Router.match");
    await submitAndExpect(page, true);
  });

  test("Find with a file, from the tree", async ({ page }) => {
    await openPuzzle(page, "e2e-find-file");
    await signIn(page);
    await page.locator('[data-testid="tree-dir"][data-path="src"]').click();
    await page.locator(`[data-testid="tree-pick"][data-path="${FILES.config}"]`).click();
    await expect(page.getByTestId("selected-answer")).toHaveText(FILES.config);
    await submitAndExpect(page, true);
  });

  test("Find with a file, from the open file", async ({ page }) => {
    await openPuzzle(page, "e2e-find-file");
    await signIn(page);
    await openFile(page, FILES.config);
    await page.getByTestId("pick-open-file").click();
    await expect(page.getByTestId("selected-answer")).toHaveText(FILES.config);
    await submitAndExpect(page, true);
  });

  test("Find with a location, shown as its canonical ID", async ({ page }) => {
    await openPuzzle(page, "e2e-find-location");
    await signIn(page);
    await openFile(page, FILES.config);
    await expect(page.getByTestId("pick-selection")).toHaveCount(0);

    await selectLines(page, "maxBodyBytes", 2);
    // Ending at column 1 of line 6 doesn't include line 6.
    await expect(page.getByTestId("selection-id")).toHaveText("src/config.ts:L4-L5");
    await page.getByTestId("pick-selection").click();
    await expect(page.getByTestId("selected-answer")).toHaveText("src/config.ts:L4-L5");
    await submitAndExpect(page, true);
  });

  test("Trace with a sequence, dragged and keyboard-moved into order", async ({ page }) => {
    await openPuzzle(page, "e2e-trace-sequence");
    await signIn(page);

    // Added out of order on purpose: match, start, handle.
    await openFile(page, FILES.router);
    await cursorOnSymbol(page, "match(path: string)", "match", "src/router.ts#Router.match");
    await page.getByTestId("pick-cursor-symbol").click();
    await openFile(page, FILES.index);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/index.ts#start"]').click();
    await openFile(page, FILES.router);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router.handle"]').click();

    const items = page.getByTestId("sequence-item");
    await expect(items).toHaveCount(3);
    const order = () => page.getByTestId("sequence-item").locator("code").allTextContents();
    expect(await order()).toEqual([
      "src/router.ts#Router.match",
      "src/index.ts#start",
      "src/router.ts#Router.handle",
    ]);

    // Wrong order is graded as wrong.
    await submitAndExpect(page, false);

    // Drag start above match.
    await items.nth(1).dragTo(items.nth(0));
    await expect.poll(order).toEqual([
      "src/index.ts#start",
      "src/router.ts#Router.match",
      "src/router.ts#Router.handle",
    ]);

    // Move handle up with the keyboard, and focus stays on the control.
    const moveUp = page.getByRole("button", { name: "Move src/router.ts#Router.handle up" });
    await moveUp.focus();
    await page.keyboard.press("Enter");
    await expect.poll(order).toEqual([
      "src/index.ts#start",
      "src/router.ts#Router.handle",
      "src/router.ts#Router.match",
    ]);
    await expect(moveUp).toBeFocused();

    await submitAndExpect(page, true);
    await expect(page.getByTestId("result")).toContainText("Attempt 2");
  });

  test("Trace sequence items can be removed", async ({ page }) => {
    await openPuzzle(page, "e2e-trace-sequence");
    await openFile(page, FILES.index);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/index.ts#start"]').click();
    await expect(page.getByTestId("sequence-item")).toHaveCount(1);
    await page.getByRole("button", { name: "Remove src/index.ts#start" }).click();
    await expect(page.getByTestId("sequence-item")).toHaveCount(0);
    await expect(page.getByTestId("tray-empty")).toBeVisible();
  });

  test("Architecture with a set of a file and a symbol, showing n of N", async ({ page }) => {
    await openPuzzle(page, "e2e-arch-set");
    await signIn(page);
    const count = page.getByTestId("set-count");
    await expect(count).toHaveText("0 of 2 selected");

    await page.locator('[data-testid="tree-dir"][data-path="src"]').click();
    await page.locator(`[data-testid="tree-pick"][data-path="${FILES.views}"]`).click();
    await expect(count).toHaveText("1 of 2 selected");
    // A set needs exactly the stated count.
    await expect(page.getByTestId("submit")).toBeDisabled();

    await openFile(page, FILES.router);
    await cursorOnSymbol(page, "handle(path: string", "handle", "src/router.ts#Router.handle");
    await page.getByTestId("pick-cursor-symbol").click();
    await expect(count).toHaveText("2 of 2 selected");
    await submitAndExpect(page, true);

    // Picking the same thing again takes it back out.
    await page.getByTestId("pick-cursor-symbol").click();
    await expect(count).toHaveText("1 of 2 selected");
    await page.getByRole("button", { name: `Remove ${FILES.views}` }).click();
    await expect(count).toHaveText("0 of 2 selected");
  });

  test("Architecture with a choice, from radio options", async ({ page }) => {
    await openPuzzle(page, "e2e-arch-choice");
    await signIn(page);
    await expect(page.getByTestId("submit")).toBeDisabled();
    await page.getByRole("radio", { name: "The router module" }).check();
    await submitAndExpect(page, false);
    await page.getByRole("radio", { name: "The config module" }).check();
    await submitAndExpect(page, true);
    await expect(page.getByTestId("result")).toContainText("Attempt 2");
  });
});

test.describe("results", () => {
  test("a wrong answer shows incorrect and counts the attempt, with no solution", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    await openFile(page, FILES.router);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router"]').click();
    await submitAndExpect(page, false);
    await expect(page.getByTestId("result")).toContainText("Incorrect");
    await expect(page.getByTestId("attempts")).toHaveText("1 attempt");
    await expect(page.getByTestId("puzzle-status")).toHaveText("Attempted");
    await expect(page.getByTestId("solution")).toHaveCount(0);

    // Changing the answer clears the old result.
    await page.locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router.handle"]').click();
    await expect(page.getByTestId("result")).toHaveCount(0);
  });

  test("a correct answer unlocks the solution with raw HTML dropped, and there's no give-up", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    await expect(page.getByRole("button", { name: /give up/i })).toHaveCount(0);
    await expect(page.getByTestId("solution")).toHaveCount(0);

    await openFile(page, FILES.router);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router.match"]').click();
    await submitAndExpect(page, true);
    await expect(page.getByTestId("puzzle-status")).toHaveText("Solved");
    await page.getByTestId("view-solution").click();
    const solution = page.getByTestId("solution");
    await expect(solution).toContainText("SOLUTIONTOKEN");
    await expect(solution.locator("li")).toHaveCount(2);
    await expect(solution.locator("script")).toHaveCount(0);
    expect(await page.evaluate(() => "__solutionHtmlRan" in window)).toBe(false);

    // It stays unlocked on a fresh visit, and the list shows it.
    await page.reload();
    await expect(page.getByTestId("file-tree")).toBeVisible();
    await visible(page, "prompt-tab-solution").click();
    await expect(page.getByTestId("solution")).toContainText("SOLUTIONTOKEN");
    await page.goto("/puzzles");
    await expect(visible(page, "puzzle-row-e2e-find-symbol")).toContainText("Solved");
  });

  test("submitting waits until the page knows who is signed in, so the result always shows", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    // Hold back /api/me on the next load, as a slow network would.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/me", async (route) => {
      await held;
      await route.continue();
    });
    await page.reload();
    await expect(page.getByTestId("file-tree")).toBeVisible();
    await openFile(page, FILES.router);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router.match"]').click();
    await expect(page.getByTestId("submit")).toBeDisabled();

    release();
    await submitAndExpect(page, true);
    await expect(page.getByTestId("puzzle-status")).toHaveText("Solved");
  });

  test("signed out: you can read, but submitting prompts sign-in and keeps the answer", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await expect(page.getByTestId("signed-in-as")).toHaveCount(0);
    await openFile(page, FILES.router);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router.match"]').click();

    // The tray says sign-in is needed before the button is pressed, not only after.
    await expect(page.getByTestId("submit-gate")).toHaveText("Anyone can read this puzzle. Sign in to submit an answer.");
    await page.getByTestId("submit").click();
    const prompt = page.getByTestId("sign-in-prompt");
    await expect(page.getByTestId("submit-gate")).toHaveCount(0);
    await expect(prompt).toContainText("Sign in to submit");
    await expect(page.getByTestId("result")).toHaveCount(0);

    await prompt.getByRole("button", { name: /Local dev sign-in/ }).click();
    await expect(page.getByTestId("signed-in-as")).toHaveText(/^dev-/);
    await expect(prompt).toHaveCount(0);
    await expect(page.getByTestId("submit-gate")).toHaveCount(0);
    // Signing in didn't lose the selection or the open file.
    await expect(page.getByTestId("selected-answer")).toHaveText("src/router.ts#Router.match");
    await expect(page.getByTestId("code-viewer")).toHaveAttribute("data-shown-path", FILES.router);
    await submitAndExpect(page, true);
  });
});
