import { expect, test, type Page } from "@playwright/test";
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
    await expect(visible(page, "overview-completion")).toContainText("0%");
    await expect(visible(page, "continue-empty")).toContainText("haven't attempted a puzzle yet");
    await expect(visible(page, "continue-empty").getByRole("link", { name: "Browse puzzles" })).toHaveAttribute(
      "href",
      "/puzzles",
    );
    await expect(visible(page, "activity-summary")).toHaveText("No submissions in the last 90 days.");
    await expect(visible(page, "history-empty")).toBeVisible();
    await expect(page.getByTestId("history-load-more")).toHaveCount(0);
  });

  test("shows progress, unfinished puzzles and history, and links to the puzzle", async ({ page }) => {
    await devLogin(page, uniqueLogin("busy"));
    await answerChoice(page, "router");
    await answerChoice(page, "views");

    await page.goto("/profile");
    await expect(visible(page, "overview-attempted")).toContainText("1");
    const card = visible(page, "unfinished-e2e-arch-choice");
    await expect(card).toContainText("Who owns the port");
    await expect(card).toContainText("2 attempts");
    await expect(card).toContainText(/last submitted [A-Z][a-z]{2} \d{1,2}, \d{4}/);
    const entries = visible(page, "history").getByTestId("history-entry");
    await expect(entries).toHaveCount(2);
    await expect(entries.first()).toContainText("Incorrect");
    await expect(entries.first()).toContainText(/UTC$/);
    await expect(visible(page, "activity-summary")).toHaveText("2 submissions on 1 day in the last 90 days.");
    await visible(page, "activity").getByText("Show active days as a list").click();
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
    await expect(visible(page, "history").getByRole("alert")).toHaveText("Couldn't load more submissions. Try again.");
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
});
