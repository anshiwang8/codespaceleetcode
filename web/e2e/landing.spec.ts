import { expect, test } from "@playwright/test";
import { visible } from "./helpers";

test.describe("landing page", () => {
  test("says what it is, and Browse puzzles goes to the puzzle list", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByTestId("hero");
    await expect(page.getByRole("link", { name: "codebases home" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Practice reading code you didn't write.");
    // No unsupported trend claims.
    await expect(page.locator("main")).not.toContainText("replacing LeetCode");
    await expect(hero).toContainText("Reading puzzles needs no account.");
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toHaveAccessibleDescription(
      "to submit answers and save progress",
    );

    await hero.getByRole("link", { name: "Browse puzzles" }).click();
    await expect(page).toHaveURL(/\/puzzles$/);
    await expect(page.getByRole("heading", { name: "Puzzles", level: 1 })).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
  });

  test("Sign in starts GitHub sign-in, and says so when this server has no GitHub app", async ({ page }) => {
    // The e2e server runs without GitHub OAuth credentials, so Better Auth refuses the provider.
    await page.goto("/");
    const login = page.getByRole("button", { name: "Sign in with GitHub" });
    await expect(login).toBeEnabled();
    await expect(login).toHaveAccessibleDescription("to submit answers and save progress");

    const started = page.waitForRequest((request) => request.url().endsWith("/api/auth/sign-in/social"));
    await login.click();
    const request = await started;
    expect(request.method()).toBe("POST");
    expect(request.postDataJSON()).toMatchObject({ provider: "github", callbackURL: "/puzzles" });

    const note = page.getByTestId("log-in-note");
    await expect(note).toHaveText("GitHub sign-in isn't set up on this server yet.");
    await expect(note).toHaveAttribute("role", "alert");
    await expect(login).toBeEnabled();
    expect(new URL(page.url()).pathname).toBe("/");
    await expect(page.locator("input[type='password']")).toHaveCount(0);
  });

  test("explains the three puzzle types with real puzzles, and ends with a specific next step", async ({ page }) => {
    await page.goto("/");
    const types = page.locator("#types");
    for (const name of ["Find", "Trace", "Architecture"]) {
      await expect(types.getByRole("heading", { name, level: 3, exact: true })).toBeVisible();
    }
    await expect(types.getByRole("link", { name: "The strict-routing switch" })).toHaveAttribute("href", "/puzzles/hono-find-001");
    await page.getByTestId("try-easy").click();
    await expect(page).toHaveURL(/\/puzzles\?type=find&difficulty=easy$/);
  });

  test("the worked example is a labeled static figure from the real pinned source", async ({ page }) => {
    await page.goto("/");
    const demo = page.getByTestId("code-demo");
    await expect(demo).toContainText("A static example, not one of the puzzles");
    await expect(demo).toContainText("psf/requests");
    await expect(demo).toContainText("src/requests/structures.py#CaseInsensitiveDict");
    // Nothing in it looks like a control except the one real link, to the file at that commit.
    await expect(demo.getByRole("button")).toHaveCount(0);
    const links = demo.getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toHaveAttribute(
      "href",
      "https://github.com/psf/requests/blob/3c7baaa05ab4aa49cc819ce3a819d260de19c157/src/requests/structures.py#L20-L65",
    );
  });

  test("works on a phone with no sideways scrolling", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await expect(page.getByTestId("hero").getByRole("link", { name: "Browse puzzles" })).toBeVisible();
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
