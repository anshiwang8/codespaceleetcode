import { expect, type Page } from "@playwright/test";
import pg from "pg";

export async function fixtureAccount(page: Page, populated = false, login = "visual-review-new") {
  const response = await page.request.post("/api/dev/login", { data: { login } });
  expect(response.ok()).toBeTruthy();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query("select id from users where github_login = $1", [login]);
    const id = rows[0].id;
    await client.query("delete from submissions where user_id = $1", [id]);
    await client.query("delete from progress where user_id = $1", [id]);
    await client.query("update users set created_at = '2026-01-15T12:00:00Z' where id = $1", [id]);
    if (populated) {
      // Synthetic activity contains no canonical or submitted answer data.
      await client.query(`insert into submissions (user_id, puzzle_id, answer_json, correct, created_at)
        select $1, p.id, '{}'::jsonb, n % 3 = 0, (current_date - n + time '12:00') at time zone 'UTC'
        from puzzles p cross join generate_series(14, 1, -1) n where p.slug = 'e2e-find-file'`, [id]);
      await client.query(`insert into progress (user_id, puzzle_id, status, attempts, solved_at)
        select $1, id, 'solved', 14, current_date - interval '3 days' from puzzles where slug = 'e2e-find-file'`, [id]);
      await client.query(`insert into progress (user_id, puzzle_id, status, attempts)
        select $1, id, 'attempted', 2 from puzzles where slug = 'e2e-trace-sequence'`, [id]);
    }
  } finally { await client.end(); }
}

/** Explicit page content + hydrated account controls + fonts; no network-idle guesses. */
export async function ready(page: Page) {
  await expect(page.locator("main").first()).toBeVisible();
  if (!new URL(page.url()).pathname.match(/^\/(privacy|terms)?$/)) {
    await expect(page.getByTestId("signed-in-as").or(page.getByRole("button", { name: /^Sign in as dev-/ }))).toBeVisible();
  }
  await page.evaluate(() => document.fonts.ready);
}

/** Wait for real finite animation completion, leaving animations enabled. */
export async function settled(page: Page) {
  // Bounded polling also handles a transition canceled/replaced during Strict Mode or navigation.
  // A canceled/idle Animation's `finished` promise can remain unresolved forever.
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.playState === "running" || animation.pending)
    .map((animation) => ({ state: animation.playState, target: animation.effect instanceof KeyframeEffect
      ? animation.effect.target?.nodeName : "unknown" }))), { timeout: 5_000 }).toEqual([]);
}

export function browserIssues(page: Page) {
  const issues: string[] = [];
  page.on("pageerror", (error) => issues.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") issues.push(message.text()); });
  page.on("response", (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/api/"))
      issues.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText !== "net::ERR_ABORTED") issues.push(`Failed ${new URL(request.url()).pathname}`);
  });
  return issues;
}
