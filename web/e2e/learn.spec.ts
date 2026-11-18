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

/**
 * Records, for each view transition the page starts, which pseudo-elements are animating once
 * it's ready. It lives on `window`, so it lasts until the next full page load.
 */
async function watchViewTransitions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __transitions: string[] }).__transitions = seen;
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((update?: Parameters<typeof start>[0]) => {
      const transition = start(update);
      void transition.ready
        .then(() => {
          for (const animation of document.getAnimations()) {
            const pseudo = (animation.effect as KeyframeEffect | null)?.pseudoElement;
            if (pseudo) seen.push(pseudo);
          }
        })
        .catch(() => {});
      return transition;
    }) as typeof document.startViewTransition;
  });
}

/** Whether a lesson's code and title moved as a shared element in a recorded transition. */
const morphed = (page: Page, slug: string) =>
  page.evaluate(
    (name) => ((window as unknown as { __transitions?: string[] }).__transitions ?? []).includes(`::view-transition-group(${name})`),
    `lesson-${slug}`,
  );

const movesAllowed = (page: Page) => page.evaluate(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

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

  test("the continue button is on the first screen and nothing moves when progress loads", async ({ page }) => {
    // Signed in, progress comes from the server; hold that answer to see the page before it.
    await devLogin(page, unique("waiting"));
    let release: () => void = () => {};
    let held: Promise<void> = Promise.resolve();
    await page.route("**/api/me/learn", async (route) => {
      await held;
      await route.continue();
    });
    for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.setViewportSize(size);
      await page.goto("/learn");
      const panel = visible(page, "learn-progress");
      const button = visible(page, "continue-learning");
      const row = visible(page, "catalog-values-and-assignments");
      // Who's signed in is known first (the header and any account notice settle); progress follows.
      await expect(visible(page, "account-menu-button")).toBeVisible();
      await expect(panel).toHaveAttribute("aria-busy", "true");
      await expect(button).toBeInViewport({ ratio: 1 });
      await expect(panel.getByRole("progressbar")).toBeVisible();
      // The opening stagger has to finish before a row's position means anything.
      await expect.poll(() => row.evaluate((element) => element.getAnimations().length)).toBe(0);
      const before = { button: await button.boundingBox(), row: await row.boundingBox(), panel: await panel.boundingBox() };

      release();
      await expect(panel).not.toHaveAttribute("aria-busy", "true");
      await expect(visible(page, "learn-progress-count")).toHaveText("0 of 28 completed");
      expect({ button: await button.boundingBox(), row: await row.boundingBox(), panel: await panel.boundingBox() }).toEqual(before);

      // Every row is one link, at least 44px tall, with no gap before the next.
      const rows = await page.locator('[data-testid^="catalog-"] > a').evaluateAll((links) =>
        links.map((link) => ({ height: link.getBoundingClientRect().height, only: link.parentElement?.childElementCount === 1 })),
      );
      expect(rows).toHaveLength(COURSE.order.length);
      for (const item of rows) {
        expect(item.height).toBeGreaterThanOrEqual(44);
        expect(item.only).toBe(true);
      }
    }
    // The group index is a row of chips above the path on a phone, and the "How it works" list is gone.
    await expect(page.getByText("How it works")).toHaveCount(0);
    await expect(visible(page, "group-index").getByRole("link")).toHaveCount(COURSE.groups.length);
    await expect(page.getByText("Your path")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // On a wide screen it is a card beside the path. Following a link scrolls to that group,
    // marks it, and leaves its heading in view and focused.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByText("Your path")).toBeVisible();
    const third = COURSE.groups[2]!;
    await page.getByTestId(`index-${third.id}`).click();
    await expect(page.getByTestId(`index-${third.id}`)).toHaveAttribute("aria-current", "location");
    const heading = page.locator(`#group-${third.id}`);
    await expect(heading).toBeInViewport();
    await expect(heading).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`#group-${third.id}$`));
    await expect(page.getByTestId(`index-${third.id}`)).toHaveAttribute("aria-current", "location");
  });

  test("a row opens its lesson, and a correct check shows in the lesson and the catalog without a reload", async ({ page }) => {
    await page.goto("/learn");
    await expect(visible(page, "learn-progress-count")).toHaveText("0 of 28 completed in this browser");
    await expect(page.getByText("Suggested first")).toHaveCount(0);
    // Anywhere on the row is the link: click its reading time, not its title.
    const row = visible(page, "catalog-values-and-assignments");
    await watchViewTransitions(page);
    await row.getByText(/^\d+\smin$/).click();
    await expect(page).toHaveURL(/\/learn\/values-and-assignments$/);
    const lesson = visible(page, "lesson");
    await expect(lesson.getByRole("heading", { level: 1 })).toHaveText("L01 Values and assignments");
    // The row's code and title travel into the header as one shared element.
    if (await movesAllowed(page)) await expect.poll(() => morphed(page, "values-and-assignments")).toBe(true);

    // The same from the keyboard, with no pointer near the row: back, focus the next row, Enter.
    await lesson.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Learn" }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await page.mouse.move(0, 0);
    await visible(page, "catalog-branches-and-comparisons").getByRole("link").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/learn\/branches-and-comparisons$/);
    if (await movesAllowed(page)) await expect.poll(() => morphed(page, "branches-and-comparisons")).toBe(true);
    await page.goto("/learn/values-and-assignments");
    await expect(lesson.getByTestId("section-index").getByRole("link")).toHaveText(["Outcome", "Example", "Checks", "Next"]);

    // A request that fails says so, and leaves the selection and the lesson as they were.
    const exit = lesson.getByTestId("exercise-exit");
    const check = exit.getByTestId("check");
    await expect(check).toBeDisabled();
    await exit.getByTestId("choice-8").check();
    await expect(check).toBeEnabled();
    await page.route("**/api/learn/*/check", (route) => route.abort());
    await check.click();
    await expect(exit.getByTestId("result-error")).toContainText("your selection is still here");
    await expect(exit.getByTestId("result-correct")).toHaveCount(0);
    await expect(exit.getByTestId("choice-8")).toBeChecked();
    await expect(lesson.getByTestId("lesson-status")).not.toContainText("Completed");
    await page.unroute("**/api/learn/*/check");

    // The result waits for the server; once it answers, the status changes with it.
    await check.click();
    await expect(exit.getByTestId("result-correct")).toBeVisible();
    await expect(exit.getByTestId("result-error")).toHaveCount(0);
    await expect(lesson.getByTestId("lesson-status")).toHaveText("Completed in this browser.");

    // Back to the catalog inside the app: no reload, and the progress is already there.
    await lesson.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Learn" }).click();
    await expect(page).toHaveURL(/\/learn$/);
    await expect(visible(page, "learn-progress-count")).toHaveText("1 of 28 completed in this browser");
    await expect(visible(page, "learn-progress").getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    await expect(visible(page, "status-values-and-assignments")).toHaveAttribute("data-status", "complete");
    await expect(visible(page, "continue-learning")).toContainText("Continue learning: L02");
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
    // On a phone the previous and next links stay at the foot of the screen.
    await page.goto("/learn/branches-and-comparisons");
    await expect(visible(page, "previous-lesson")).toBeInViewport({ ratio: 1 });
    await expect(visible(page, "next-lesson")).toBeInViewport({ ratio: 1 });
    await expect(page.getByTestId("nav-learn")).toBeVisible();
    const missing = await page.goto("/learn/not-a-lesson");
    expect(missing?.status()).toBe(404);
  });
});
