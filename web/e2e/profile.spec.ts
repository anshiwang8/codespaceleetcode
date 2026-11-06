import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { visible } from "./helpers";

/** Signs in with the dev login under a chosen name, through the same route the header button uses. */
async function devLogin(page: Page, login: string): Promise<void> {
  const base = test.info().project.use.baseURL ?? "";
  const response = await page.request.post("/api/dev/login", { data: { login }, headers: { origin: base } });
  expect(response.ok()).toBe(true);
}

/** A graded choice answer to e2e-arch-choice, sent as the answer tray would send it. */
async function answerChoice(page: Page, option: "router" | "config" | "views"): Promise<void> {
  const base = test.info().project.use.baseURL ?? "";
  const response = await page.request.post("/api/puzzles/e2e-arch-choice/submit", {
    data: { kind: "choice", option },
    headers: { origin: base },
  });
  expect(response.ok()).toBe(true);
}

function uniqueLogin(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
}

test.describe("profile", () => {
  test("signed out, it explains itself and offers sign-in, with no one's data", async ({ page }) => {
    await page.goto("/profile");
    const signedOut = visible(page, "profile-signed-out");
    await expect(signedOut.getByRole("heading", { level: 1 })).toHaveText("Your profile");
    await expect(signedOut.getByRole("button", { name: /Local dev sign-in/ })).toBeVisible();
    await expect(page.getByTestId("profile")).toHaveCount(0);
    await expect(page.getByTestId("nav-profile")).toHaveAttribute("aria-current", "page");
  });

  test("a new account shows helpful empty states", async ({ page }) => {
    const login = uniqueLogin("fresh");
    await devLogin(page, login);
    await page.goto("/profile");
    await expect(visible(page, "profile-identity").getByRole("heading", { level: 1 })).toHaveText(login);
    await expect(visible(page, "profile-provider")).toHaveText(/Local development account/);
    await expect(page.getByTestId("profile-github-link")).toHaveCount(0);
    await expect(visible(page, "stats-total")).toContainText("0 of 7");
    await expect(visible(page, "summary-completion")).toContainText("0%");
    await expect(visible(page, "summary-submissions")).toContainText("0");
    await expect(visible(page, "streak-current")).toHaveText("0 days");
    await expect(visible(page, "streak-today")).toContainText("No submissions today");
    await expect(visible(page, "continue-empty")).toContainText("haven't attempted a puzzle yet");
    await expect(visible(page, "continue-empty").getByRole("link", { name: "Browse puzzles" })).toHaveAttribute(
      "href",
      "/puzzles",
    );
    await expect(visible(page, "activity-summary")).toHaveText(/^Last 365 days: 0 submissions, /);
    await expect(visible(page, "solve-chart-summary")).toContainText("No puzzles first solved in this period.");
    await expect(visible(page, "history-empty")).toBeVisible();
    await expect(page.getByTestId("history-load-more")).toHaveCount(0);
  });

  test("shows progress, unfinished puzzles and history, and links to the puzzle", async ({ page }) => {
    await devLogin(page, uniqueLogin("busy"));
    await answerChoice(page, "router");
    await answerChoice(page, "views");

    await page.goto("/profile");
    await expect(visible(page, "summary-attempted")).toContainText("1");
    await expect(visible(page, "summary-in-progress")).toContainText("1");
    await expect(visible(page, "summary-submissions")).toContainText("2");
    await expect(visible(page, "streak-current")).toHaveText("1 day");
    await expect(visible(page, "streak-today")).toContainText("Practiced today");
    const card = visible(page, "unfinished-e2e-arch-choice");
    await expect(card).toContainText("Who owns the port");
    await expect(card).toContainText("2 attempts");
    await expect(card).toContainText(/last submitted [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    const entries = visible(page, "history").getByTestId("history-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText("Incorrect");
    await expect(entries.first()).toContainText(/UTC$/);
    await expect(visible(page, "activity-summary")).toHaveText(/^Last 365 days: 2 submissions, /);
    await expect(visible(page, "activity-active-days")).toHaveText("1 in the last 365 days");
    await visible(page, "activity").getByText("Show active days as a table").click();
    await expect(visible(page, "activity-table").locator("tbody tr")).toHaveCount(1);

    // Topics overlap, and the page says so.
    await expect(visible(page, "stats-topic")).toContainText("don't add up to your total");

    await card.getByRole("link", { name: "Who owns the port" }).click();
    await expect(page).toHaveURL(/\/puzzles\/e2e-arch-choice$/);
    await expect(page.getByTestId("nav-puzzles")).toHaveAttribute("aria-current", "true");

    // Solving it moves it out of "Continue practicing", and a later miss doesn't move it back.
    await answerChoice(page, "config");
    await answerChoice(page, "router");
    await page.goto("/profile");
    await expect(visible(page, "stats-total")).toContainText("1 of 7");
    await expect(page.getByTestId("unfinished-e2e-arch-choice")).toHaveCount(0);
    await expect(visible(page, "continue-empty")).toContainText("Every puzzle you've attempted is solved");
  });

  test("loads more history, and says so when that fails", async ({ page }) => {
    await devLogin(page, uniqueLogin("pager"));
    for (let index = 0; index < 12; index++) await answerChoice(page, "router");
    await page.goto("/profile");
    const entries = visible(page, "history").getByTestId("history-entry");
    await expect(entries).toHaveCount(10);

    await page.route("**/api/me/history**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await visible(page, "history-load-more").click();
    await expect(visible(page, "history").getByRole("alert")).toHaveText("Couldn't load more submissions. Try again");
    await expect(entries).toHaveCount(10);

    await page.unroute("**/api/me/history**");
    await visible(page, "history-load-more").click();
    await expect(entries).toHaveCount(12);
    await expect(visible(page, "history-load-more")).toHaveAttribute("aria-disabled", "true");
    await expect(visible(page, "history-load-more")).toBeFocused();
    await expect(visible(page, "history")).toContainText("That’s everything.");
  });

  test("the page sends no email, token or answer data", async ({ page }) => {
    await devLogin(page, uniqueLogin("private"));
    await answerChoice(page, "config");
    const response = await page.goto("/profile");
    const html = (await response?.text()) ?? "";
    for (const secret of ["dev-login.invalid", "github-user.invalid", "answer_json", "\"option\"", "## Solution"]) {
      expect(html).not.toContain(secret);
    }
    const api = await page.request.get("/api/me/profile");
    expect(api.headers()["cache-control"]).toBe("no-store");
    const body = await api.text();
    expect(body).not.toContain("dev-login.invalid");
    expect(body).not.toContain("\"option\"");
  });

  test("a 39-character login fits a phone without sideways scrolling", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      const login = `long-${"x".repeat(28)}${Math.random().toString(16).slice(2, 8)}`;
      expect(login).toHaveLength(39);
      await devLogin(page, login);
      await answerChoice(page, "router");
      for (const path of ["/profile", "/puzzles"]) {
        await page.goto(path);
        await expect(page.getByTestId("signed-in-as").first()).toHaveText(login);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  });

  test("keyboard users can skip to the content, and see where focus is", async ({ page }) => {
    await page.goto("/puzzles");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement ?? document.body).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("the calendar has one tab stop, moves by arrow keys, and filters history to a picked date", async ({ page }) => {
    await devLogin(page, uniqueLogin("keys"));
    await answerChoice(page, "router");
    await answerChoice(page, "config");
    await page.goto("/profile");
    const grid = visible(page, "activity-grid");
    await expect(grid.locator('[role=gridcell][tabindex="0"]')).toHaveCount(1);
    const start = grid.locator('[role=gridcell][tabindex="0"]');
    await expect(start).toHaveAttribute("data-today", "true");
    const today = (await start.getAttribute("data-date")) ?? "";
    await start.focus();

    // Left is a week back, Up is a day back; the tab stop follows focus.
    await page.keyboard.press("ArrowLeft");
    const weekBack = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
    await expect(page.locator(":focus")).toHaveAttribute("data-date", weekBack);
    await expect(grid.locator('[role=gridcell][tabindex="0"]')).toHaveAttribute("data-date", weekBack);
    await expect(visible(page, "activity-detail")).toContainText(":");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(":focus")).toHaveAttribute("data-date", today);
    await expect(visible(page, "activity-detail")).toContainText("(today): 2 submissions, 1 correct.");

    // Enter picks the date: history shows only that date, and it can be reset.
    await page.keyboard.press("Enter");
    await expect(page.locator(":focus")).toHaveAttribute("aria-selected", "true");
    await expect(visible(page, "activity-selected")).toBeVisible();
    await expect(visible(page, "history-date")).toBeVisible();
    await expect(visible(page, "history").getByTestId("history-entry")).toHaveCount(2);
    await visible(page, "history").getByRole("combobox", { name: "Result" }).selectOption("passed");
    await expect(visible(page, "history").getByTestId("history-entry")).toHaveCount(1);
    await visible(page, "history-date").getByRole("button", { name: "Show all dates" }).click();
    await expect(page.getByTestId("history-date")).toHaveCount(0);
    await expect(page.getByTestId("activity-selected")).toHaveCount(0);
    await expect(visible(page, "history").getByTestId("history-entry")).toHaveCount(1);
    await visible(page, "history").getByRole("button", { name: "Clear filters" }).click();
    await expect(visible(page, "history").getByTestId("history-entry")).toHaveCount(2);
  });

  test("history filters run on the server, and an older response never replaces a newer one", async ({ page }) => {
    await devLogin(page, uniqueLogin("race"));
    for (const option of ["router", "router", "config", "router"] as const) await answerChoice(page, option);
    await page.goto("/profile");
    const history = visible(page, "history");
    await expect(history.getByTestId("history-entry")).toHaveCount(4);

    // Hold the "Incorrect" request until the "Correct" one has been answered.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const failedOnly = (url: URL) => url.pathname === "/api/me/history" && url.searchParams.get("outcome") === "failed";
    await page.route(failedOnly, async (route) => {
      await gate;
      await route.continue().catch(() => {});
    });
    const result = history.getByRole("combobox", { name: "Result" });
    await result.selectOption("failed");
    await result.selectOption("passed");
    await expect(history.getByTestId("history-entry")).toHaveCount(1);
    await expect(history.getByTestId("history-entry")).toContainText("Correct");
    release();
    await page.waitForTimeout(300);
    await expect(history.getByTestId("history-entry")).toHaveCount(1);
    await expect(history.getByTestId("history-entry")).toContainText("Correct");
    await page.unrouteAll({ behavior: "ignoreErrors" });

    // No matches says so, rather than looking empty.
    await history.getByRole("combobox", { name: "Difficulty" }).selectOption("hard");
    await expect(visible(page, "history-no-matches")).toBeVisible();
  });

  test("another period loads in place, recovers from a failure, and leaves lifetime streaks alone", async ({ page }) => {
    await devLogin(page, uniqueLogin("period"));
    await answerChoice(page, "router");
    await page.goto("/profile");
    const year = new Date().getUTCFullYear().toString();
    const streak = await visible(page, "streak-longest").textContent();

    await page.route("**/api/me/activity**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await visible(page, "activity-period").selectOption(year);
    await expect(visible(page, "activity-error")).toContainText(`Couldn't load ${year}. Still showing the last 365 days.`);
    await expect(visible(page, "activity-summary")).toHaveText(/^Last 365 days: /);
    // The picker matches what's shown, not the period that failed.
    await expect(visible(page, "activity-period")).toHaveValue("rolling");

    await page.unroute("**/api/me/activity**");
    await visible(page, "activity-error").getByRole("button", { name: "Try again" }).click();
    await expect(visible(page, "activity-summary")).toHaveText(new RegExp(`^${year}: 1 submission, `));
    await expect(page.getByTestId("activity-error")).toHaveCount(0);
    await expect(visible(page, "streak-longest")).toHaveText(streak ?? "");
    await expect(visible(page, "solve-chart")).toContainText(year);
  });

  test("solving every available puzzle shows 100% and says so", async ({ page }) => {
    const login = uniqueLogin("allsolved");
    await devLogin(page, login);
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `insert into progress (user_id, puzzle_id, status, attempts, solved_at)
         select u.id, p.id, 'solved', 1, now() from users u cross join puzzles p
          where u.github_login = $1 and p.published`,
        [login],
      );
    } finally {
      await client.end();
    }
    await page.goto("/profile");
    await expect(visible(page, "summary-completion")).toContainText("100%");
    await expect(visible(page, "stats-total")).toContainText("7 of 7");
    await expect(visible(page, "continue-empty")).toContainText("solved every available puzzle");
  });

  test("on a phone the calendar scrolls on its own, opened at the newest dates", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await devLogin(page, uniqueLogin("phone"));
      await page.goto("/profile");
      const scroller = visible(page, "activity-scroll");
      const metrics = await scroller.evaluate((element) => ({
        overflow: element.scrollWidth - element.clientWidth,
        left: element.scrollLeft,
      }));
      expect(metrics.overflow).toBeGreaterThan(0);
      expect(metrics.left).toBeGreaterThanOrEqual(metrics.overflow - 1);
      // The calendar is below the fold; once it's on screen, today is inside its visible area.
      await scroller.scrollIntoViewIfNeeded();
      const today = visible(page, "activity-grid").locator('[data-today="true"]');
      await expect(today).toBeInViewport();
      const [cell, frame] = await Promise.all([today.boundingBox(), scroller.boundingBox()]);
      expect(cell && frame && cell.x >= frame.x && cell.x + cell.width <= frame.x + frame.width).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      // A tap shows the date's details.
      await visible(page, "activity-grid").locator('[data-today="true"]').tap();
      await expect(visible(page, "activity-detail")).toContainText("(today): no submissions.");
    } finally {
      await context.close();
    }
  });
});
