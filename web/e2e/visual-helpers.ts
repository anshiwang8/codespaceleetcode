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

async function withClient<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * About 14 months of synthetic daily activity for an existing fixture account: 0 to 8 submissions
 * a day, every fifth day empty, active through yesterday, and four puzzles first solved on
 * different dates. Synthetic rows hold no submitted answer data.
 */
export async function denseActivity(login: string) {
  await withClient(async (client) => {
    const { rows } = await client.query("select id from users where github_login = $1", [login]);
    const id = rows[0].id;
    await client.query("delete from submissions where user_id = $1", [id]);
    await client.query("delete from progress where user_id = $1", [id]);
    await client.query("update users set created_at = (current_date - 430) at time zone 'UTC' where id = $1", [id]);
    await client.query(
      `insert into submissions (user_id, puzzle_id, answer_json, correct, created_at)
       select $1, p.id, '{}'::jsonb, (n + k) % 4 = 0, (current_date - n + time '09:00' + k * interval '1 hour') at time zone 'UTC'
         from puzzles p cross join generate_series(1, 420) n cross join generate_series(0, 7) k
        where p.slug = 'e2e-trace-sequence' and n % 5 <> 0 and k < (n * 7) % 9`,
      [id],
    );
    await client.query(
      `insert into progress (user_id, puzzle_id, status, attempts, solved_at)
       select $1, p.id, 'solved', 3, (current_date - d) at time zone 'UTC'
         from (values ('e2e-find-file', 300), ('e2e-find-symbol', 200), ('e2e-arch-choice', 40), ('e2e-find-location', 5)) v(slug, d)
         join puzzles p on p.slug = v.slug`,
      [id],
    );
    await client.query(
      `insert into progress (user_id, puzzle_id, status, attempts)
       select $1, id, 'attempted', 900 from puzzles where slug = 'e2e-trace-sequence'`,
      [id],
    );
  });
}

/** Marks every published puzzle solved for an existing fixture account. */
export async function solveEverything(login: string) {
  await withClient(async (client) => {
    await client.query(
      `insert into progress (user_id, puzzle_id, status, attempts, solved_at)
       select u.id, p.id, 'solved', 1, now() from users u cross join puzzles p
        where u.github_login = $1 and p.published
       on conflict (user_id, puzzle_id) do update set status = 'solved', solved_at = excluded.solved_at`,
      [login],
    );
  });
}

export const LONG_REPO = "an-organization-with-a-long-name-and-an-even-longer-repository-name";

/**
 * Runs `work` while a published puzzle exists in a repository with a very long slug, attempted by
 * `login`, then removes it again so other captures keep the usual seven puzzles.
 */
export async function withLongRepository(login: string, work: () => Promise<void>) {
  await withClient(async (client) => {
    await client.query(
      `with repo as (
         insert into repos (slug, url, language, license)
         values ($1, 'https://example.invalid/long', 'typescript', 'MIT') returning id
       ), snapshot as (
         insert into snapshots (repo_id, sha, name, manifest_url)
         select id, repeat('f', 40), $1 || '@' || repeat('f', 40), '/snapshots/long/manifest.json' from repo returning id
       ), puzzle as (
         insert into puzzles (snapshot_id, slug, type, difficulty, title, prompt, answer_kind, answer_json, set_count,
                              choices, hints, tags, verified_by, published)
         select snapshot.id, 'visual-long-repository', p.type, p.difficulty,
                'A puzzle whose repository has an unusually long name to check wrapping', p.prompt, p.answer_kind,
                p.answer_json, p.set_count, p.choices, p.hints, p.tags, p.verified_by, true
           from snapshot, puzzles p where p.slug = 'e2e-find-file' returning id
       )
       insert into submissions (user_id, puzzle_id, answer_json, correct)
       select u.id, puzzle.id, '{}'::jsonb, false from users u, puzzle where u.github_login = $2`,
      [LONG_REPO, login],
    );
    await client.query(
      `insert into progress (user_id, puzzle_id, status, attempts)
       select u.id, p.id, 'attempted', 1 from users u, puzzles p
        where u.github_login = $1 and p.slug = 'visual-long-repository'`,
      [login],
    );
  });
  try {
    await work();
  } finally {
    await withClient(async (client) => {
      await client.query("delete from puzzles where slug = 'visual-long-repository'");
      await client.query("delete from snapshots where name like $1 || '@%'", [LONG_REPO]);
      await client.query("delete from repos where slug = $1", [LONG_REPO]);
    });
  }
}
