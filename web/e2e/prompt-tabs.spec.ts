import { expect, type Page, test } from "@playwright/test";
import { FILES, openPuzzle, signIn, submitAndExpect, visible } from "./helpers";

/** Every request for a solution this page makes, so a test can check none went out while locked. */
function solutionRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/solution")) urls.push(request.url());
  });
  return urls;
}

/** e2e-find-file's solution is the fixture's rich one, with a table and two mermaid blocks. */
async function solveFindFile(page: Page): Promise<void> {
  await openPuzzle(page, "e2e-find-file");
  await signIn(page);
  await page.locator('[data-testid="tree-dir"][data-path="src"]').click();
  await page.locator(`[data-testid="tree-pick"][data-path="${FILES.config}"]`).click();
  await submitAndExpect(page, true);
}

test.describe("prompt panel tabs", () => {
  test("Description and Solution tabs, with Description selected, and arrow keys between them", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    const tablist = visible(page, "prompt-tabs");
    await expect(tablist).toHaveAttribute("role", "tablist");
    const tabs = tablist.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText("Description");
    await expect(tabs.nth(1)).toContainText("Solution");

    const description = page.getByTestId("prompt-tab-description");
    const solution = page.getByTestId("prompt-tab-solution");
    await expect(description).toHaveAttribute("aria-selected", "true");
    await expect(solution).toHaveAttribute("aria-selected", "false");
    // Each tab names the panel it controls, and only the selected one is shown.
    const descriptionPanel = page.locator(`[id="${await description.getAttribute("aria-controls")}"]`);
    const solutionPanel = page.locator(`[id="${await solution.getAttribute("aria-controls")}"]`);
    await expect(descriptionPanel).toHaveAttribute("role", "tabpanel");
    await expect(descriptionPanel).toBeVisible();
    await expect(solutionPanel).toBeHidden();
    await expect(page.getByTestId("prompt")).toBeVisible();
    await expect(page.getByTestId("answer-kind")).toBeVisible();

    await description.focus();
    await page.keyboard.press("ArrowRight");
    await expect(solution).toHaveAttribute("aria-selected", "true");
    await expect(solution).toBeFocused();
    await expect(solutionPanel).toBeVisible();
    await expect(descriptionPanel).toBeHidden();

    await page.keyboard.press("ArrowLeft");
    await expect(description).toHaveAttribute("aria-selected", "true");
    await expect(description).toBeFocused();
    await expect(page.getByTestId("prompt")).toBeVisible();
  });

  test("before solving, the Solution tab is locked, shows no solution, and never fetches it", async ({ page }) => {
    const requests = solutionRequests(page);
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    await page.getByTestId("prompt-tab-solution").click();

    const locked = page.getByTestId("solution-locked");
    await expect(locked).toBeVisible();
    await expect(locked).toContainText("Solve this puzzle to see the solution and a full explanation.");
    await expect(page.getByTestId("solution")).toHaveCount(0);
    await expect(page.getByTestId("prompt-panel-solution")).not.toContainText("SOLUTIONTOKEN");
    await expect(page.getByTestId("solution-tab-badge")).toHaveCount(0);

    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
  });

  test("signed out, the locked Solution tab says to sign in", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await page.getByTestId("prompt-tab-solution").click();
    await expect(page.getByTestId("solution-locked")).toContainText("Sign in to submit an answer.");
    await expect(page.getByTestId("solution")).toHaveCount(0);
  });

  test("a correct solve marks the Solution tab without switching, and View solution opens it", async ({ page }) => {
    const requests = solutionRequests(page);
    await solveFindFile(page);

    // Still on Description, with the Solution tab marked and nothing fetched yet.
    const description = page.getByTestId("prompt-tab-description");
    const solutionTab = page.getByTestId("prompt-tab-solution");
    await expect(description).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("solution-tab-badge")).toHaveText("Unlocked");
    await expect(page.getByTestId("solution")).toHaveCount(0);
    expect(requests).toEqual([]);

    await page.getByTestId("view-solution").click();
    await expect(solutionTab).toHaveAttribute("aria-selected", "true");
    await expect(solutionTab).toBeFocused();
    const solution = page.getByTestId("solution");
    await expect(solution).toBeVisible();
    await expect(solution).toContainText("SOLUTIONTOKEN");
    await expect(page.getByTestId("solution-tab-badge")).toHaveCount(0);

    // Switching away and back uses the solution already loaded.
    await description.click();
    await expect(solution).toBeHidden();
    await solutionTab.click();
    await expect(solution).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(requests).toHaveLength(1);
  });

  test("a mermaid block renders as an SVG, and one that doesn't parse shows its source", async ({ page }) => {
    await solveFindFile(page);
    await page.getByTestId("view-solution").click();
    const solution = page.getByTestId("solution");
    await expect(solution).toContainText("SOLUTIONTOKEN");

    const drawn = solution.locator('[data-testid="mermaid-diagram"][data-state="ready"]');
    await expect(drawn).toHaveCount(1);
    await expect(drawn.locator("svg")).toHaveCount(1);
    await expect(drawn.locator("svg")).toBeVisible();
    await expect(drawn).toContainText("Router.handle");
    // The diagram scrolls inside its own box instead of widening the panel.
    const fits = await drawn.evaluate((element) => {
      const panel = element.closest('[data-testid="solution"]');
      return panel !== null && element.getBoundingClientRect().width <= panel.getBoundingClientRect().width + 1;
    });
    expect(fits).toBe(true);

    // Expand shows it large in a dialog, and Escape closes it.
    await solution.getByTestId("mermaid-expand").click();
    const dialog = page.getByTestId("mermaid-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("svg")).toBeVisible();
    await expect(dialog).toContainText("Router.handle");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const failed = solution.locator('[data-testid="mermaid-diagram"][data-state="error"]');
    await expect(failed).toHaveCount(1);
    await expect(failed.getByTestId("mermaid-error")).toContainText("Diagram failed to render");
    await expect(failed.locator("pre code")).toHaveText("this is not a diagram");
    // mermaid's own error graphic isn't left in the page.
    await expect(page.locator("body > [id^='dmermaid-diagram-']")).toHaveCount(0);
  });

  test("a GFM table renders as a table", async ({ page }) => {
    await solveFindFile(page);
    await page.getByTestId("view-solution").click();
    const solution = page.getByTestId("solution");
    await expect(solution).toContainText("SOLUTIONTOKEN");

    const table = solution.locator("table");
    await expect(table).toHaveCount(1);
    await expect(table.locator("th")).toHaveText(["Module", "Owns"]);
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.locator("td code").first()).toHaveText("src/config.ts");
    await expect(table.locator("td").nth(1)).toHaveText("RICHTABLECELL limits");
    // No raw markdown pipes left over.
    await expect(solution).not.toContainText("|---|");
  });
});
