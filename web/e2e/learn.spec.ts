import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { COURSE } from "../lib/learn/course.generated";
import { LEARN_GUEST_KEY } from "../lib/learn/storage";
import { signOutFromHeader, visible } from "./helpers";

const base = () => test.info().project.use.baseURL ?? "";

async function devLogin(page: Page, login: string): Promise<void> {
  const response = await page.request.post("/api/dev/login", { data: { login }, headers: { origin: base() } });
  expect(response.ok()).toBe(true);
}

const unique = (prefix: string) => `${prefix}-${Math.random().toString(16).slice(2, 8)}`;

/**
 * Every private string in the Learn keys, read from the generated file as data: it imports
 * server-only, so a test can't import it as a module.
 */
function privateStrings(): string[] {
  const text = readFileSync(path.join(__dirname, "../lib/server/learn/keys.generated.ts"), "utf8");
  const json = text.slice(text.indexOf("= {") + 2).trim().replace(/;$/, "");
  const keys = JSON.parse(json) as Record<string, { exercises: Record<string, { explanation: string; hints: string[]; feedback: Record<string, string> }>; rubric?: string }>;
  const strings: string[] = [];
  for (const lesson of Object.values(keys)) {
    for (const key of Object.values(lesson.exercises)) strings.push(key.explanation, ...key.hints, ...Object.values(key.feedback));
    if (lesson.rubric) strings.push(...lesson.rubric.split(/\n{2,}/).map((part) => part.trim()));
  }
  return strings.filter((value) => value.length > 0);
}

/** How HTML and React's flight data would write a string: escaped quotes and ampersands. */
const forms = (value: string) => [value, value.replaceAll('"', '\\"'), value.replaceAll("'", "&#x27;").replaceAll('"', "&quot;")];

test.describe("Learn", () => {
  test("the catalog lists every group, module and lesson, and the header links to it", async ({ page }) => {
    await page.goto("/learn");
    const learn = visible(page, "learn");
    await expect(learn.getByRole("heading", { level: 1, name: "Learn" })).toBeVisible();
    for (const group of COURSE.groups) {
      await expect(learn.getByRole("heading", { name: `Group ${group.number}: ${group.title}` })).toBeVisible();
      for (const learnModule of group.modules) {
        await expect(learn.getByRole("heading", { name: `Module ${learnModule.number}: ${learnModule.title}` })).toBeVisible();
      }
    }
    for (const slug of COURSE.order) await expect(learn.getByTestId(`catalog-${slug}`)).toHaveCount(1);
    await expect(learn.getByTestId("learn-progress-count")).toHaveText("0 of 28 completed in this browser");
    await expect(learn.getByTestId("continue-learning")).toContainText("Start learning: L01");
    await page.goto("/puzzles");
    await expect(page.getByTestId("nav-learn")).toBeVisible();
    await page.getByTestId("list-learn-link").getByRole("link", { name: "Start with Learn" }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(page.getByTestId("nav-learn")).toHaveAttribute("aria-current", "page");
  });

  test("a beginner lesson works signed out: hint, a wrong answer, a reveal that doesn't complete, then a correct check", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    await page.goto("/learn/values-and-assignments");
    const lesson = visible(page, "lesson");
    await expect(lesson.getByRole("heading", { level: 1 })).toHaveText("L01 Values and assignments");
    await expect(lesson.getByTestId("lesson-status")).toHaveText("Answer the exit check correctly to complete this lesson.");

    // The worked explanation waits until the learner asks for it.
    const worked = lesson.getByTestId("worked-example");
    await expect(worked.locator("table")).toBeHidden();
    await worked.locator("summary").click();
    await expect(worked.locator("table")).toBeVisible();

    const guided = lesson.getByTestId("exercise-guided");
    await guided.getByTestId("hint").click();
    await expect(guided.getByTestId("hints")).toContainText("Stop immediately after");
    await expect(guided.getByTestId("hint")).toHaveCount(0);
    await guided.getByTestId("choice-10").check();
    await guided.getByTestId("check").click();
    await expect(guided.getByTestId("result-wrong")).toContainText("Line 4 changes");
    await expect(guided.getByTestId("result-wrong")).not.toContainText("11");

    const exit = lesson.getByTestId("exercise-exit");
    await expect(exit.getByTestId("hint")).toHaveCount(0);
    await exit.getByTestId("reveal").click();
    await expect(exit.getByTestId("revealed")).toContainText("Answer: 8");
    await expect(exit.getByTestId("revealed")).toContainText("doesn't complete the lesson");
    await expect(lesson.getByTestId("lesson-status")).not.toContainText("Completed");

    // Keyboard only: focus the choice, select it with Space, and submit.
    await exit.getByTestId("choice-8").focus();
    await page.keyboard.press("Space");
    await expect(exit.getByTestId("choice-8")).toBeChecked();
    await exit.getByTestId("check").focus();
    await page.keyboard.press("Enter");
    await expect(exit.getByTestId("result-correct")).toContainText("Correct.");
    await expect(lesson.getByTestId("lesson-status")).toHaveText("Completed in this browser.");

    // Kept in this browser, versioned by revision, across a reload and in the catalog.
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), LEARN_GUEST_KEY);
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ v: 1, lessons: { "values-and-assignments": [{ revision: 1, correct: ["exit"] }] } });
    await page.reload();
    await expect(visible(page, "lesson-status")).toHaveText("Completed in this browser.");
    await visible(page, "next-lesson").click();
    await expect(page).toHaveURL(/\/learn\/branches-and-comparisons$/);
    await page.goto("/learn");
    await expect(visible(page, "learn-progress-count")).toHaveText("1 of 28 completed in this browser");
    await expect(visible(page, "status-values-and-assignments")).toHaveAttribute("data-status", "complete");
    await expect(visible(page, "continue-learning")).toContainText("Continue learning: L02");

    // Reading a lesson never loads the code editor.
    expect(scripts.some((url) => /monaco|editor\.main/.test(url))).toBe(false);
  });

  test("a signed-in checkpoint completes only after all three items, is saved to the account, and stays with it", async ({ page }) => {
    const login = unique("learner");
    await devLogin(page, login);
    await page.goto("/learn/c1-receipt-trace");
    const lesson = visible(page, "lesson");
    await expect(lesson.getByTestId("lesson-status")).toHaveText("Answer all 3 checks correctly to complete this.");
    await expect(lesson.getByTestId("code-receipt")).toBeVisible();

    const branch = lesson.getByTestId("exercise-branch");
    await branch.getByTestId("choice-resets").check();
    await branch.getByTestId("check").click();
    await expect(branch.getByTestId("result-wrong")).toContainText("To review, see L02 Branches and comparisons");
    await branch.getByTestId("choice-unchanged").check();
    await branch.getByTestId("check").click();
    await expect(branch.getByTestId("result-correct")).toBeVisible();
    await expect(lesson.getByTestId("lesson-status")).toHaveText("1 of 3 checks correct.");

    for (const [id, choice] of [["state", "four-four-ten"], ["return", "8"]] as const) {
      const item = lesson.getByTestId(`exercise-${id}`);
      await item.getByTestId(`choice-${choice}`).check();
      await item.getByTestId("check").click();
      await expect(item.getByTestId("result-correct")).toBeVisible();
    }
    await expect(lesson.getByTestId("lesson-status")).toHaveText("Completed. Saved to your account.");
    const saved = await page.request.get("/api/me/learn");
    expect(saved.headers()["cache-control"]).toBe("no-store");
    expect(await saved.json()).toMatchObject({
      lessons: [{ slug: "c1-receipt-trace", revision: 1, correct: ["branch", "return", "state"], completedAt: expect.any(String) }],
    });
    // Nothing went into this browser's guest storage.
    expect(await page.evaluate((key) => window.localStorage.getItem(key), LEARN_GUEST_KEY)).toBeNull();

    // Signed out, the account's progress isn't shown; someone else signed in doesn't see it either.
    await signOutFromHeader(page);
    await expect(page.getByRole("button", { name: /^Sign in/ }).first()).toBeVisible();
    await page.goto("/learn");
    await expect(visible(page, "learn-progress-count")).toHaveText("0 of 28 completed in this browser");
    await devLogin(page, unique("someone-else"));
    await page.goto("/learn");
    await expect(visible(page, "learn-progress-count")).toHaveText("0 of 28 completed");
    await devLogin(page, login);
    await page.goto("/learn");
    await expect(visible(page, "learn-progress-count")).toHaveText("1 of 28 completed");
    await expect(visible(page, "status-c1-receipt-trace")).toHaveAttribute("data-status", "complete");
  });

  test("the capstone's four tasks: a line, an ordered trace built from the keyboard, a file and a design call", async ({ page }) => {
    await page.goto("/learn/codebase-investigation-capstone");
    const lesson = visible(page, "lesson");
    for (const file of ["route", "service", "adapters"]) await expect(lesson.getByTestId(`code-${file}`)).toBeVisible();

    const find = lesson.getByTestId("exercise-find");
    await find.getByTestId("line-4").check();
    await find.getByTestId("check").click();
    await expect(find.getByTestId("result-wrong")).toBeVisible();
    await find.getByTestId("line-3").check();
    await find.getByTestId("check").click();
    await expect(find.getByTestId("result-correct")).toContainText("Line 3");

    const trace = lesson.getByTestId("exercise-trace");
    for (const step of ["load-report", "get-report", "cache-get", "store-read", "cache-set"]) {
      await trace.getByTestId(`add-${step}`).click();
    }
    await expect(trace.getByTestId("add-get-report")).toBeDisabled();
    await trace.getByTestId("check").click();
    await expect(trace.getByTestId("result-wrong")).toBeVisible();
    // Fix the order with the keyboard: move getReport up one place.
    await trace.getByRole("button", { name: "Move getReport earlier" }).focus();
    await page.keyboard.press("Enter");
    await expect(trace.getByTestId("sequence-answer").locator("li").first()).toContainText("getReport");
    await trace.getByTestId("check").click();
    await expect(trace.getByTestId("result-correct")).toBeVisible();

    const architecture = lesson.getByTestId("exercise-architecture");
    await architecture.getByTestId("choice-service").check();
    await architecture.getByTestId("check").click();
    await expect(architecture.getByTestId("result-correct")).toBeVisible();
    await expect(lesson.getByTestId("lesson-status")).not.toContainText("Completed");
    const design = lesson.getByTestId("exercise-design");
    await design.getByTestId("choice-stale").check();
    await design.getByTestId("check").click();
    await expect(design.getByTestId("result-correct")).toBeVisible();
    await expect(lesson.getByTestId("lesson-status")).toHaveText("Completed in this browser.");

    // The reflection stays on the page; the rubric comes only when asked for.
    const reflection = lesson.getByTestId("reflection");
    await expect(reflection.getByTestId("rubric")).toHaveCount(0);
    await reflection.locator("textarea").fill("It saves a store read, but a hit can be stale.");
    await reflection.getByTestId("show-rubric").click();
    await expect(reflection.getByTestId("rubric")).toContainText("one point");
  });

  test("no lesson page carries an answer, explanation, hint, feedback or rubric", async ({ page }) => {
    const secrets = privateStrings();
    expect(secrets.length).toBeGreaterThan(60);
    for (const slug of ["", ...COURSE.order.map((item) => `/${item}`)]) {
      const html = await (await page.request.get(`/learn${slug}`)).text();
      for (const secret of secrets) {
        for (const form of forms(secret)) expect(html.includes(form), `${slug}: ${secret}`).toBe(false);
      }
    }
  });

  test("reads on a 375px phone without sideways scrolling, and an unknown lesson is a 404", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const slug of ["", "/values-and-assignments", "/c1-receipt-trace", "/codebase-investigation-capstone"]) {
      await page.goto(`/learn${slug}`);
      await expect(page.locator("main").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, slug).toBeLessThanOrEqual(0);
    }
    await expect(page.getByTestId("nav-learn")).toBeVisible();
    const missing = await page.goto("/learn/not-a-lesson");
    expect(missing?.status()).toBe(404);
  });
});
