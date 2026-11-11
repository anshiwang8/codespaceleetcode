import { expect, test } from "@playwright/test";
import pg from "pg";
import { FILES, openFile, openPuzzle, signIn, submitAndExpect, visible } from "./helpers";

test.describe("puzzle list", () => {
  test("shows every puzzle with its repo and language", async ({ page }) => {
    // Grouped by difficulty, the section heading gives the difficulty instead of each row.
    await page.goto("/puzzles");
    await expect(visible(page, "group-medium").getByTestId("puzzle-row-e2e-trace-sequence")).toBeVisible();
    await expect(visible(page, "group-medium").getByRole("columnheader", { name: "Difficulty" })).toHaveCount(0);

    await page.goto("/puzzles?group=none");
    const row = visible(page, "puzzle-row-e2e-trace-sequence");
    await expect(row).toContainText("From start to match");
    await expect(row).toContainText("Trace");
    await expect(row).toContainText("Medium");
    await expect(row).toContainText("acme-tiny");
    await expect(row).toContainText("TypeScript");
  });

  test("filters live in the URL, and survive a reload", async ({ page }) => {
    await page.goto("/puzzles");
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

    await page.goto("/puzzles?tag=configuration");
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-arch-set")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Topic" })).toHaveValue("configuration");

    await page.goto("/puzzles?repo=acme-tiny&type=find&difficulty=medium");
    await expect(visible(page, "puzzle-row-e2e-find-location")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(2);
  });

  test("the difficulty strip filters, counts, and clears when clicked again", async ({ page }) => {
    await page.goto("/puzzles");
    const hard = visible(page, "difficulty-hard");
    await expect(visible(page, "difficulty-easy")).toContainText("3 puzzles");
    await expect(hard).toContainText("2 puzzles");

    await hard.click();
    await expect(page).toHaveURL(/difficulty=hard/);
    await expect(visible(page, "difficulty-hard")).toHaveAttribute("aria-current", "true");
    await expect(visible(page, "puzzle-row-e2e-arch-set")).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-find-symbol")).toHaveCount(0);
    await expect(visible(page, "puzzle-count")).toHaveText("2 of 8 puzzles");

    // The other filters narrow the strip's counts, so each says what clicking it would show.
    await page.goto("/puzzles?difficulty=hard&type=find");
    await expect(visible(page, "difficulty-easy")).toContainText("2 puzzles");
    await expect(visible(page, "difficulty-hard")).toContainText("1 puzzle");

    await visible(page, "difficulty-hard").click();
    await expect(page).not.toHaveURL(/difficulty=/);
    await expect(page).toHaveURL(/type=find/);
  });

  test("the topic drop-down filters by topic, by its label", async ({ page }) => {
    await page.goto("/puzzles");
    const topic = page.getByRole("combobox", { name: "Topic" });
    await expect(topic.locator("option")).toHaveText(["All topics", "Routing", "Configuration and defaults", "Caching and storage", "Auth and security", "Code structure"]);

    await topic.selectOption({ label: "Code structure" });
    await expect(page).toHaveURL(/tag=code-structure/);
    await expect(visible(page, "puzzle-row-e2e-arch-set")).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-arch-choice")).toBeVisible();
    await expect(visible(page, "puzzle-row-e2e-find-file")).toHaveCount(0);

    await topic.selectOption("");
    await expect(page).not.toHaveURL(/tag=/);
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
  });

  test("clicking a column header sorts every group, and clicking it again reverses", async ({ page }) => {
    // Signed out, the list has no status column, so the title is the first cell.
    const titles = (testId: string) => visible(page, testId).locator("tbody tr td:nth-child(1)");
    await page.goto("/puzzles?group=none");
    await visible(page, "sort-title").click();
    await expect(page).toHaveURL(/sort=title/);
    await expect(page.getByRole("columnheader", { name: "Puzzle" })).toHaveAttribute("aria-sort", "ascending");
    const ascending = [
      "A puzzle whose answer nobody should see",
      "From start to match",
      "The byte limits",
      "What the router needs",
      "Where a cached limit is read",
      "Where a path is matched",
      "Where limits live",
      "Who owns the port",
    ];
    await expect(page.locator("tbody tr td:nth-child(1)")).toHaveText(ascending);

    await visible(page, "sort-title").click();
    await expect(page).toHaveURL(/sort=-title/);
    await expect(page.getByRole("columnheader", { name: "Puzzle" })).toHaveAttribute("aria-sort", "descending");
    await expect(page.locator("tbody tr td:nth-child(1)")).toHaveText([...ascending].reverse());

    // Difficulty goes easiest first, not alphabetically.
    await visible(page, "sort-difficulty").click();
    await expect(page.locator("tbody tr td:nth-child(3)")).toHaveText([
      "Easy", "Easy", "Easy", "Medium", "Medium", "Medium", "Hard", "Hard",
    ]);

    // In groups, each section is sorted, and changing the grouping keeps the sort.
    await page.goto("/puzzles?sort=title");
    await visible(page, "group-by-topic").click();
    await expect(page).toHaveURL(/group=topic/);
    await expect(page).toHaveURL(/sort=title/);
    await expect(titles("group-code-structure")).toHaveText(["What the router needs", "Who owns the port"]);
    await visible(page, "group-code-structure").getByTestId("sort-title").click();
    await expect(page).toHaveURL(/sort=-title/);
    await expect(titles("group-code-structure")).toHaveText(["Who owns the port", "What the router needs"]);
    await expect(titles("group-routing")).toHaveText(["Where a path is matched", "From start to match"]);
  });

  test("groups by difficulty, topic, repo or not at all", async ({ page }) => {
    await page.goto("/puzzles");
    await expect(visible(page, "group-by-difficulty")).toHaveAttribute("aria-current", "true");
    await expect(visible(page, "group-easy")).toContainText("3 puzzles");
    await expect(visible(page, "group-easy").getByTestId("puzzle-row-e2e-arch-choice")).toBeVisible();
    await expect(visible(page, "group-hard").getByTestId("puzzle-row-e2e-arch-set")).toBeVisible();

    // Folding a section hides its rows and leaves the others.
    await visible(page, "group-easy").locator("summary").click();
    await expect(visible(page, "group-easy").getByTestId("puzzle-row-e2e-arch-choice")).toBeHidden();
    await expect(visible(page, "group-hard").getByTestId("puzzle-row-e2e-arch-set")).toBeVisible();

    await visible(page, "group-by-topic").click();
    await expect(page).toHaveURL(/group=topic/);
    await expect(visible(page, "group-routing")).toContainText("Matching a request to the code that handles it.");
    await expect(visible(page, "group-routing").getByTestId("puzzle-row-e2e-trace-sequence")).toBeVisible();
    await expect(visible(page, "group-configuration").getByTestId("puzzle-row-e2e-find-file")).toBeVisible();

    // A topic filter keeps the grouping, and shows only that topic's section.
    await page.getByRole("combobox", { name: "Topic" }).selectOption("routing");
    await expect(page).toHaveURL(/tag=routing/);
    await expect(page).toHaveURL(/group=topic/);
    await expect(page.locator("section[data-testid^='group-']").filter({ visible: true })).toHaveCount(1);

    await page.goto("/puzzles?group=repo");
    await expect(visible(page, "group-acme-tiny")).toContainText("typescript");

    await page.goto("/puzzles?group=none");
    await expect(page.locator("section[data-testid^='group-']")).toHaveCount(0);
    await expect(page.getByRole("row")).toHaveCount(9); // Header and eight puzzles.

    await page.goto("/puzzles?group=bogus");
    await expect(visible(page, "group-by-difficulty")).toHaveAttribute("aria-current", "true");
  });

  test("a filter matching nothing, or a bad filter value, doesn't break the page", async ({ page }) => {
    await page.goto("/puzzles?repo=nothing-here");
    await expect(visible(page, "no-matches")).toBeVisible();
    await page.goto("/puzzles?type=bogus");
    await expect(visible(page, "puzzle-row-e2e-find-file")).toBeVisible();
  });

  test("solved state shows per row", async ({ page }) => {
    await openPuzzle(page, "e2e-arch-choice");
    await signIn(page);
    await page.getByRole("radio", { name: "The config module" }).check();
    await submitAndExpect(page, true);
    await page.goto("/puzzles");
    await expect(visible(page, "puzzle-row-e2e-arch-choice")).toContainText("Solved");
    await expect(visible(page, "puzzle-row-e2e-find-file")).toContainText("Not started");
    await expect(visible(page, "puzzle-count")).toHaveText("8 puzzles, 1 solved");
    await expect(visible(page, "difficulty-easy")).toContainText("1 of 3 solved");
    await expect(visible(page, "group-easy")).toContainText("1 of 3 solved");
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
      await page.goto("/puzzles");
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

  test("with nothing published, the list says so without developer instructions", async ({ page }) => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query("update puzzles set published = false");
      await page.goto("/puzzles");
      await expect(visible(page, "no-puzzles-seeded")).toContainText("No puzzles yet");
      await expect(visible(page, "no-puzzles-seeded")).not.toContainText("ingest");
    } finally {
      await client.query("update puzzles set published = true");
      await client.end();
    }
  });
});

test.describe("dev sign-in and profile", () => {
  test("the header's control is labeled, signs in and signs out", async ({ page }) => {
    await page.goto("/puzzles");
    await expect(page.getByText("Local dev sign-in, no account")).toBeVisible();
    // No GitHub OAuth app on the e2e server, so only the dev sign-in is offered.
    await expect(page.getByTestId("github-sign-in")).toHaveCount(0);
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
    await expect(visible(page, "stats-total")).toContainText("0 of 8");

    await openPuzzle(page, "e2e-find-file");
    await openFile(page, FILES.config);
    await visible(page, "pick-open-file").click();
    await submitAndExpect(page, true);

    await page.goto("/profile");
    await expect(visible(page, "stats-total")).toContainText("1 of 8");
    await expect(visible(page, "stats-row-find").getByTestId("solved-count")).toHaveText("1");
    await expect(visible(page, "stats-row-trace").getByTestId("solved-count")).toHaveText("0");
    await expect(visible(page, "stats-row-easy").getByTestId("solved-count")).toHaveText("1");
    await expect(visible(page, "stats-row-hard").getByTestId("solved-count")).toHaveText("0");
    await expect(page.getByRole("progressbar", { name: "Find" })).toHaveAttribute("aria-valuetext", /^1 of \d+ solved$/);
  });
});
