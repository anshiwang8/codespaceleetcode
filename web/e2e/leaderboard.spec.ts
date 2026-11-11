import { expect, test, type Page } from "@playwright/test";
import { visible } from "./helpers";

const base = () => test.info().project.use.baseURL ?? "";
const unique = (prefix: string) => `${prefix}-${Math.random().toString(16).slice(2, 8)}`;

/** Signs in with the dev login under a chosen name, through the same route the header button uses. */
async function devLogin(page: Page, login: string): Promise<void> {
  const response = await page.request.post("/api/dev/login", { data: { login }, headers: { origin: base() } });
  expect(response.ok()).toBe(true);
}

/**
 * Solves e2e-arch-choice (easy) on the first try, as the answer tray would send it, and returns the
 * points awarded (125, plus a challenge bonus if it happens to be a current challenge's puzzle).
 */
async function solveChoice(page: Page): Promise<number> {
  const response = await page.request.post("/api/puzzles/e2e-arch-choice/submit", {
    data: { kind: "choice", option: "config" },
    headers: { origin: base() },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { correct: boolean; pointsAwarded: number };
  expect(body.correct).toBe(true);
  expect(body.pointsAwarded).toBeGreaterThanOrEqual(125);
  return body.pointsAwarded;
}

test.describe("leaderboard", () => {
  test("signed out, it shows the periods, the scoring rules and the privacy line", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Leaderboard");
    await expect(visible(page, "leaderboard-period-all")).toHaveAttribute("aria-current", "page");
    await expect(visible(page, "leaderboard-signed-out")).toBeVisible();
    await expect(visible(page, "leaderboard-scoring")).toContainText("How scoring works");
    await expect(visible(page, "leaderboard-privacy")).toContainText("No GitHub username, email or picture is shown.");

    await visible(page, "leaderboard-period-daily").click();
    await expect(page).toHaveURL(/\/leaderboard\?period=daily$/);
    await expect(visible(page, "leaderboard-period-daily")).toHaveAttribute("aria-current", "page");
    await expect(visible(page, "leaderboard-period-all")).not.toHaveAttribute("aria-current", "page");
  });

  test("private by default, appears after joining, and disappears after leaving", async ({ page, browser }) => {
    const login = unique("lb");
    const publicName = unique("Board tester").replace("-", " ");
    await devLogin(page, login);
    const points = `${(await solveChoice(page)).toLocaleString("en-US")} points`;

    // Not joined: the points show only to their owner, and nobody else sees the account.
    await page.goto("/leaderboard");
    await expect(visible(page, "leaderboard-private")).toContainText("Your points are private until you join.");
    await expect(visible(page, "leaderboard-private-points")).toContainText(points);
    await expect(page.locator('[data-testid="leaderboard-row"][data-you="true"]')).toHaveCount(0);

    // Join from Settings under a public name.
    await visible(page, "leaderboard-join-link").click();
    await expect(page).toHaveURL(/\/settings#leaderboard$/);
    await expect(visible(page, "leaderboard-visibility-state")).toContainText("Not on the leaderboard");
    await visible(page, "public-name-input").fill("x");
    await visible(page, "leaderboard-save").click();
    await expect(visible(page, "public-name-error")).toHaveText("Use at least 2 characters.");
    await visible(page, "public-name-input").fill(publicName);
    await visible(page, "leaderboard-save").click();
    await expect(visible(page, "leaderboard-status")).toContainText("Joined.");
    await expect(visible(page, "leaderboard-visibility-state")).toContainText(publicName);

    await page.goto("/leaderboard");
    const own = page.locator('[data-testid="leaderboard-row"][data-you="true"]').filter({ visible: true });
    await expect(own).toHaveCount(1);
    await expect(own.getByTestId("leaderboard-name")).toHaveText(publicName);
    await expect(own).toContainText(points.replace(" points", ""));
    await expect(own.locator('[data-testid="avatar"]')).toHaveAttribute("data-kind", "silhouette");
    await expect(visible(page, "leaderboard-you-rank")).toContainText("Your rank: #");

    // Someone signed out sees the public name, never the login.
    const stranger = await browser.newPage();
    await stranger.goto("/leaderboard");
    await expect(stranger.getByTestId("leaderboard-name").filter({ hasText: publicName })).toHaveCount(1);
    await expect(stranger.getByText(login)).toHaveCount(0);

    // A second account can't take the same name.
    const rival = await browser.newContext();
    const rivalPage = await rival.newPage();
    await devLogin(rivalPage, unique("lb-rival"));
    await rivalPage.goto("/settings#leaderboard");
    await visible(rivalPage, "public-name-input").fill(publicName);
    await visible(rivalPage, "leaderboard-save").click();
    await expect(visible(rivalPage, "public-name-error")).toHaveText("That name is taken. Choose another.");
    await rival.close();

    // Leaving removes the entry; the points stay private on the account.
    await page.goto("/settings#leaderboard");
    await visible(page, "leaderboard-leave").click();
    await expect(visible(page, "leaderboard-status")).toContainText("You've left the leaderboard.");
    await expect(visible(page, "leaderboard-visibility-state")).toContainText("Not on the leaderboard");

    await page.goto("/leaderboard");
    await expect(page.locator('[data-testid="leaderboard-row"][data-you="true"]')).toHaveCount(0);
    await expect(visible(page, "leaderboard-private-points")).toContainText(points);
    await stranger.reload();
    await expect(stranger.getByTestId("leaderboard-name").filter({ hasText: publicName })).toHaveCount(0);
    await stranger.close();
  });
});
