import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { visible } from "./helpers";
import type { ChallengesResponse } from "../lib/api-types";

/** Signs in with the dev login under a chosen name, through the same route the header button uses. */
async function devLogin(page: Page, login: string): Promise<void> {
  const base = test.info().project.use.baseURL ?? "";
  const response = await page.request.post("/api/dev/login", { data: { login }, headers: { origin: base } });
  expect(response.ok()).toBe(true);
}

function uniqueLogin(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 8)}`;
}

type FixtureKey =
  | { kind: "symbol"; id: string }
  | { kind: "file"; path: string }
  | { kind: "location"; path: string; anchor: [number, number] }
  | { kind: "sequence"; ids: string[] }
  | { kind: "set"; ids: string[] }
  | { kind: "choice"; option: string };

/**
 * The correct submission for a fixture puzzle, built from its key the way the answer tray builds
 * one. The key is read from the throwaway e2e database, as visual-helpers.ts does; this runs in
 * the test process, never in the browser.
 */
async function correctAnswer(slug: string): Promise<Record<string, unknown>> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let key: FixtureKey;
  try {
    const { rows } = await client.query<{ answer_json: FixtureKey }>("select answer_json from puzzles where slug = $1", [slug]);
    if (!rows[0]) throw new Error(`${slug} isn't a fixture puzzle`);
    key = rows[0].answer_json;
  } finally {
    await client.end();
  }
  switch (key.kind) {
    case "symbol":
      return { kind: "symbol", id: key.id };
    case "file":
      return { kind: "file", path: key.path };
    case "location":
      return { kind: "location", id: `${key.path}:L${key.anchor[0]}-L${key.anchor[1]}` };
    case "sequence":
      return { kind: "sequence", ids: key.ids };
    case "set":
      return { kind: "set", ids: key.ids };
    case "choice":
      return { kind: "choice", option: key.option };
  }
}

async function currentChallenges(page: Page): Promise<ChallengesResponse> {
  const response = await page.request.get("/api/challenges");
  expect(response.ok()).toBe(true);
  return (await response.json()) as ChallengesResponse;
}

test.describe("challenges", () => {
  test("signed out, it shows this period's three challenges read-only and offers sign-in", async ({ page }) => {
    await page.goto("/challenges");
    await expect(visible(page, "challenges").getByRole("heading", { level: 1 })).toHaveText("Challenges");
    await expect(page.getByTestId("nav-challenges")).toHaveAttribute("aria-current", "page");
    for (const [kind, type, points] of [
      ["daily", "Daily", /^\+50\u00a0pts$/],
      ["weekly", "Weekly", /^\+100\u00a0pts$/],
      ["monthly", "Monthly", /^\+200\u00a0pts$/],
    ] as const) {
      // A bar holds its type, a countdown, its points and one button.
      const bar = visible(page, `challenge-${kind}`);
      await expect(bar).toBeVisible();
      await expect(bar.getByRole("heading", { level: 2 })).toHaveText(`${type} challenge`);
      await expect(bar.getByTestId("challenge-time-left")).toHaveText(/^(\d+d \d+h|\d+h \d+m|\d+m|under a minute)$/);
      await expect(bar.getByTestId("challenge-bonus")).toHaveText(points);
      await expect(bar.getByRole("link")).toHaveCount(1);
      await expect(bar.getByTestId("challenge-puzzle")).toHaveAttribute("href", /^\/puzzles\/e2e-/);
      await expect(bar.getByTestId("challenge-puzzle")).toHaveText("Start");
    }
    // The rotation times moved into the closed disclosure under the board.
    const rules = visible(page, "challenge-rules");
    await expect(rules).not.toHaveAttribute("open", "");
    await expect(rules.getByTestId("challenge-rotation").first()).toBeHidden();
    await rules.locator("summary").click();
    await expect(rules.getByTestId("challenge-rotation")).toHaveCount(3);
    for (const rotation of await rules.getByTestId("challenge-rotation").all()) {
      await expect(rotation).toBeVisible();
      await expect(rotation).toContainText("00:00 UTC");
    }
    await expect(rules).toContainText("to keep your streak");
    await expect(page.getByTestId("challenge-state")).toHaveCount(0);
    await expect(visible(page, "challenges-signed-out").getByRole("button", { name: /Local dev sign-in/ })).toBeVisible();
    await expect(page.getByTestId("challenge-streak")).toHaveCount(0);
  });

  test("solving the daily puzzle completes it, starts the streak and shows on the puzzle list", async ({ page }) => {
    await devLogin(page, uniqueLogin("daily"));
    await page.goto("/challenges");
    await expect(visible(page, "challenge-daily").getByTestId("challenge-puzzle")).toHaveAttribute(
      "data-state",
      /not-started|solved-elsewhere|attempted/,
    );
    await expect(visible(page, "challenge-streak-current")).toHaveText("0 days");
    await expect(visible(page, "challenge-streak-today")).toContainText("Not completed yet");
    const calendar = visible(page, "challenge-streak-calendar");
    await expect(calendar.locator("[data-day]")).toHaveCount(35);
    await expect(calendar.locator('[data-today="true"]')).toHaveAttribute("data-state", "open");
    await expect(visible(page, "challenge-streak").getByRole("progressbar")).toHaveAttribute("aria-valuetext", "0 of 7 days");

    const { current } = await currentChallenges(page);
    const daily = current.find((card) => card.kind === "daily");
    if (!daily?.puzzle) throw new Error("the fixture should always have a daily challenge");
    const base = test.info().project.use.baseURL ?? "";
    const submit = await page.request.post(`/api/puzzles/${daily.puzzle.slug}/submit`, {
      data: await correctAnswer(daily.puzzle.slug),
      headers: { origin: base },
    });
    expect(submit.ok()).toBe(true);
    const result = (await submit.json()) as { correct: boolean; challenges: { kind: string; bonus: number }[] };
    expect(result.correct).toBe(true);
    expect(result.challenges).toContainEqual({ kind: "daily", bonus: 50 });

    await page.reload();
    const card = visible(page, "challenge-daily");
    await expect(card).toHaveAttribute("data-completed", "true");
    await expect(card.getByTestId("challenge-puzzle")).toHaveText("Completed");
    await expect(card.getByTestId("challenge-puzzle")).toHaveAttribute("data-state", "completed");
    await expect(card.getByTestId("challenge-puzzle")).toHaveAttribute("href", `/puzzles/${daily.puzzle.slug}`);
    await expect(visible(page, "challenge-streak-current")).toHaveText("1 day");
    await expect(visible(page, "challenge-streak-today")).toContainText("Completed today");
    // Today on the calendar is the server's UTC date, and it's filled.
    const todayCell = visible(page, "challenge-streak-calendar").locator('[data-today="true"]');
    await expect(todayCell).toHaveAttribute("data-day", daily.periodStart);
    await expect(todayCell).toHaveAttribute("data-state", "completed");
    await expect(visible(page, "challenge-streak").getByRole("progressbar")).toHaveAttribute("aria-valuetext", "1 of 7 days");
    await expect(visible(page, "challenge-streak-longest")).toHaveText("1");
    await expect(visible(page, "challenge-count-daily")).toHaveText("1");

    await page.goto("/puzzles");
    const strip = visible(page, "today-challenge");
    await expect(strip.getByTestId("today-challenge-puzzle")).toHaveText(daily.puzzle.title);
    await expect(strip.getByTestId("today-challenge-completed")).toHaveText("Completed");
  });

  test("at 1440 wide the bars' columns line up and the two columns are one height", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const box = async (testId: string, inside?: string) => {
      const scope = inside ? visible(page, inside) : page;
      const target = inside ? scope.getByTestId(testId) : visible(page, testId);
      const bounds = await target.boundingBox();
      if (!bounds) throw new Error(`${testId} has no box`);
      return bounds;
    };
    const check = async (rightColumn: string) => {
      // Each part of a bar starts at the same x in all three, and the buttons are one width.
      for (const part of ["challenge-time-left", "challenge-bonus", "challenge-puzzle"]) {
        const daily = await box(part, "challenge-daily");
        const weekly = await box(part, "challenge-weekly");
        const monthly = await box(part, "challenge-monthly");
        expect(Math.abs(daily.x - weekly.x), part).toBeLessThanOrEqual(1);
        expect(Math.abs(daily.x - monthly.x), part).toBeLessThanOrEqual(1);
        if (part !== "challenge-time-left") {
          expect(Math.abs(daily.x + daily.width - (monthly.x + monthly.width)), part).toBeLessThanOrEqual(1);
        }
      }
      const bars = await box("challenge-bars");
      const right = await box(rightColumn);
      expect(Math.abs(bars.height - right.height), rightColumn).toBeLessThanOrEqual(1);
      expect(Math.abs(bars.y - right.y), rightColumn).toBeLessThanOrEqual(1);
      // The three bars are one height, and the disclosure spans both columns.
      const heights = await Promise.all((["daily", "weekly", "monthly"] as const).map(async (kind) => (await box(`challenge-${kind}`)).height));
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
      const rules = await box("challenge-rules");
      expect(Math.abs(rules.x - bars.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(rules.x + rules.width - (right.x + right.width))).toBeLessThanOrEqual(1);
    };
    try {
      await page.goto("/challenges");
      await check("challenges-signed-out");
      await devLogin(page, uniqueLogin("layout"));
      await page.goto("/challenges");
      await check("challenge-streak");
    } finally {
      await context.close();
    }
  });

  test("the puzzle list strip sits above the filters without changing them", async ({ page }) => {
    await page.goto("/puzzles?difficulty=hard&group=none");
    const strip = visible(page, "today-challenge");
    await expect(strip).toContainText("Today's challenge");
    await expect(strip.getByTestId("challenge-time-left")).toContainText(/^Ends in /);
    await expect(page).toHaveURL(/\/puzzles\?difficulty=hard&group=none$/);
    await expect(visible(page, "puzzle-count")).toHaveText(/^\d+ of \d+ puzzles$/);
    await strip.getByTestId("today-challenge-all").click();
    await expect(page).toHaveURL(/\/challenges$/);
  });

  test("the archive lists past periods by kind, from the URL, with the user's result", async ({ page }) => {
    // A past daily period, so the archive has something whatever day the run is on.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `insert into challenge_assignments (period_kind, period_start, puzzle_id)
         select 'daily', $1::date, id from puzzles where slug = 'e2e-find-file'
         on conflict do nothing`,
        [yesterday],
      );
    } finally {
      await client.end();
    }

    await devLogin(page, uniqueLogin("archive"));
    await page.goto("/challenges");
    await visible(page, "challenges-archive-link").click();
    await expect(page).toHaveURL(/\/challenges\/archive$/);
    await expect(page.getByTestId("archive-kind-daily")).toHaveAttribute("aria-current", "page");
    const item = visible(page, "archive-list").locator(`[data-period="${yesterday}"]`);
    await expect(item).toBeVisible();
    await expect(item.getByTestId("challenge-state")).toHaveText("Not attempted");
    await expect(visible(page, "challenge-archive")).toContainText("doesn't earn the bonus");

    // The kind control is links: reachable by keyboard, and the choice lives in the URL.
    await page.getByTestId("archive-kind-weekly").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/challenges\/archive\?kind=weekly$/);
    await expect(page.getByTestId("archive-kind-weekly")).toHaveAttribute("aria-current", "page");
    await expect(visible(page, "archive-list").or(visible(page, "archive-empty"))).toBeVisible();

    // A bad kind or cursor falls back instead of failing.
    await page.goto("/challenges/archive?kind=yearly&before=not-a-date");
    await expect(page.getByTestId("archive-kind-daily")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("archive-position")).toHaveCount(0);
  });

  test("on a phone the challenges fit the screen", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      for (const path of ["/challenges", "/challenges/archive", "/puzzles"]) {
        await page.goto(path);
        await expect(page.locator("main").first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  });
});
