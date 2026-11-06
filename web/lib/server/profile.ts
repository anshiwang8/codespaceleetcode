import "server-only";
import type {
  ActivityDay,
  Difficulty,
  HistoryEntry,
  HistoryPage,
  ProfileActivity,
  ProfileIdentity,
  ProfileProgress,
  ProfileResponse,
  ProgressCount,
  PuzzleType,
  UnfinishedPuzzle,
} from "@/lib/api-types";
import { orderTags } from "@/lib/browse";
import { getPool } from "@/lib/server/db";

// The profile's data. Every query here is scoped to one user id, which callers take from
// getCurrentUser, and counts only published puzzles. Nothing here reads an answer key, a submitted
// answer, a solution, a token or the stored email.

/** How many days the activity view covers, ending today. */
export const ACTIVITY_DAYS = 90;
/** Activity is grouped into days in this zone, so a day means the same thing for everyone. */
export const ACTIVITY_TIME_ZONE = "UTC";
export const HISTORY_PAGE_SIZE = 10;
export const HISTORY_MAX_PAGE_SIZE = 50;
export const UNFINISHED_LIMIT = 6;

const PUZZLE_TYPES: PuzzleType[] = ["find", "trace", "architecture"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const zero = (): ProgressCount => ({ solved: 0, attempted: 0, total: 0 });

/** One published puzzle and the user's status on it. */
export interface ProgressRow {
  type: PuzzleType;
  difficulty: Difficulty;
  tags: string[];
  repo_slug: string;
  language: string;
  status: "attempted" | "solved" | null;
}

function add(count: ProgressCount, status: ProgressRow["status"]): void {
  count.total += 1;
  if (status === "solved") count.solved += 1;
  else if (status === "attempted") count.attempted += 1;
}

/** Whole percent, rounded down, so 135 of 136 reads 99 rather than 100. */
export function completionPercent(solved: number, total: number): number {
  return total === 0 ? 0 : Math.floor((solved / total) * 100);
}

/** Counts per type, difficulty, repo and topic. A puzzle counts once in each of its topics. */
export function summarizeProgress(rows: ProgressRow[]): ProfileProgress {
  const overall = zero();
  const byType = Object.fromEntries(PUZZLE_TYPES.map((type) => [type, zero()])) as Record<PuzzleType, ProgressCount>;
  const byDifficulty = Object.fromEntries(DIFFICULTIES.map((difficulty) => [difficulty, zero()])) as Record<
    Difficulty,
    ProgressCount
  >;
  const repos = new Map<string, { language: string; count: ProgressCount }>();
  const topics = new Map<string, ProgressCount>();

  for (const row of rows) {
    add(overall, row.status);
    add(byType[row.type], row.status);
    add(byDifficulty[row.difficulty], row.status);
    let repo = repos.get(row.repo_slug);
    if (!repo) {
      repo = { language: row.language, count: zero() };
      repos.set(row.repo_slug, repo);
    }
    add(repo.count, row.status);
    // A tag listed twice on one puzzle still counts that puzzle once.
    for (const tag of new Set(row.tags)) {
      let topic = topics.get(tag);
      if (!topic) {
        topic = zero();
        topics.set(tag, topic);
      }
      add(topic, row.status);
    }
  }

  return {
    ...overall,
    completionPercent: completionPercent(overall.solved, overall.total),
    byType,
    byDifficulty,
    byRepo: [...repos.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "en-US"))
      .map(([repo, { language, count }]) => ({ repo, language, ...count })),
    byTopic: orderTags(topics.keys()).map((topic) => ({ topic, ...(topics.get(topic) ?? zero()) })),
  };
}

/** YYYY-MM-DD of a moment, in UTC. */
function utcDate(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** The days of the window ending on `now`'s UTC date, oldest first. */
export function activityWindow(now: Date, days = ACTIVITY_DAYS): string[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: days }, (_, index) => utcDate(new Date(end - (days - 1 - index) * 86_400_000)));
}

/** Fills in the days with no submissions, so the result has one entry per day of the window. */
export function fillActivity(window: string[], counted: ActivityDay[]): ProfileActivity {
  const byDate = new Map(counted.map((day) => [day.date, day]));
  const days = window.map((date) => byDate.get(date) ?? { date, submissions: 0, passed: 0 });
  return {
    timeZone: ACTIVITY_TIME_ZONE,
    days,
    activeDays: days.filter((day) => day.submissions > 0).length,
    submissions: days.reduce((sum, day) => sum + day.submissions, 0),
  };
}

async function getIdentity(userId: string): Promise<ProfileIdentity | null> {
  const { rows } = await getPool().query<{
    github_login: string;
    created_at: Date;
    name: string | null;
    has_github: boolean;
  }>(
    `select u.github_login, u.created_at, a.name,
            exists (
              select 1 from auth_accounts ac where ac.user_id = u.id and ac.provider_id = 'github'
            ) as has_github
       from users u
       join auth_users a on a.id = u.id
      where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const name = row.name?.trim().slice(0, 100) ?? "";
  const provider = row.has_github ? "github" : "dev";
  return {
    login: row.github_login,
    displayName: name !== "" && name.toLowerCase() !== row.github_login.toLowerCase() ? name : null,
    provider,
    memberSince: row.created_at.toISOString(),
    githubUrl: provider === "github" ? `https://github.com/${encodeURIComponent(row.github_login)}` : null,
  };
}

async function getProgress(userId: string): Promise<ProfileProgress> {
  const { rows } = await getPool().query<ProgressRow>(
    `select p.type, p.difficulty, p.tags, r.slug as repo_slug, r.language, pr.status
       from puzzles p
       join snapshots s on s.id = p.snapshot_id
       join repos r on r.id = s.repo_id
       left join progress pr on pr.puzzle_id = p.id and pr.user_id = $1
      where p.published`,
    [userId],
  );
  return summarizeProgress(rows);
}

async function getUnfinished(userId: string): Promise<UnfinishedPuzzle[]> {
  const { rows } = await getPool().query<{
    slug: string;
    title: string;
    type: PuzzleType;
    difficulty: Difficulty;
    repo_slug: string;
    attempts: number;
    last_at: Date | null;
  }>(
    `select p.slug, p.title, p.type, p.difficulty, r.slug as repo_slug, pr.attempts, last.last_at
       from progress pr
       join puzzles p on p.id = pr.puzzle_id
       join snapshots s on s.id = p.snapshot_id
       join repos r on r.id = s.repo_id
       left join (
         select puzzle_id, max(created_at) as last_at
           from submissions
          where user_id = $1
          group by puzzle_id
       ) last on last.puzzle_id = p.id
      where pr.user_id = $1 and pr.status = 'attempted' and p.published
      order by last.last_at desc nulls last, p.id
      limit $2`,
    [userId, UNFINISHED_LIMIT],
  );
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    type: row.type,
    difficulty: row.difficulty,
    repoSlug: row.repo_slug,
    attempts: row.attempts,
    lastSubmittedAt: row.last_at ? row.last_at.toISOString() : null,
  }));
}

/** Graded submissions per UTC day over the window ending on `now`'s date. */
export async function getActivity(userId: string, now: Date = new Date()): Promise<ProfileActivity> {
  const window = activityWindow(now);
  const { rows } = await getPool().query<{ date: string; submissions: number; passed: number }>(
    `select to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD') as date,
            count(*)::int as submissions,
            (count(*) filter (where s.correct))::int as passed
       from submissions s
       join puzzles p on p.id = s.puzzle_id
      where s.user_id = $1
        and p.published
        and s.created_at >= ($2::date)::timestamp at time zone 'UTC'
        and s.created_at < ($3::date + 1)::timestamp at time zone 'UTC'
      group by 1`,
    [userId, window[0], window[window.length - 1]],
  );
  return fillActivity(window, rows);
}

/**
 * The user's graded submissions, newest first, one page at a time. `before` is the `id` of the
 * last entry already shown; the next page starts after that submission's (created_at, id), so a
 * submission made while paging can't shift a page or repeat an entry. A cursor that isn't one of
 * this user's submissions matches nothing, so it gives an empty page rather than someone else's.
 */
export async function getHistory(
  userId: string,
  options: { before?: string | null; limit?: number } = {},
): Promise<HistoryPage> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? HISTORY_PAGE_SIZE), 1), HISTORY_MAX_PAGE_SIZE);
  const { rows } = await getPool().query<{
    id: string;
    slug: string;
    title: string;
    repo_slug: string;
    type: PuzzleType;
    difficulty: Difficulty;
    passed: boolean;
    created_at: Date;
  }>(
    `select s.id::text as id, p.slug, p.title, r.slug as repo_slug, p.type, p.difficulty,
            s.correct as passed, s.created_at
       from submissions s
       join puzzles p on p.id = s.puzzle_id
       join snapshots sn on sn.id = p.snapshot_id
       join repos r on r.id = sn.repo_id
      where s.user_id = $1
        and p.published
        and (
          $2::bigint is null
          or (s.created_at, s.id) < (
            select c.created_at, c.id from submissions c where c.id = $2::bigint and c.user_id = $1
          )
        )
      order by s.created_at desc, s.id desc
      limit $3`,
    [userId, options.before ?? null, limit + 1],
  );
  const page = rows.slice(0, limit);
  const entries: HistoryEntry[] = page.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    repoSlug: row.repo_slug,
    type: row.type,
    difficulty: row.difficulty,
    passed: row.passed,
    submittedAt: row.created_at.toISOString(),
  }));
  return { entries, nextCursor: rows.length > limit ? (entries.at(-1)?.id ?? null) : null };
}

/** Everything the profile page shows, or null if the user no longer exists. */
export async function getProfile(userId: string, now: Date = new Date()): Promise<ProfileResponse | null> {
  const [identity, progress, unfinished, activity, history] = await Promise.all([
    getIdentity(userId),
    getProgress(userId),
    getUnfinished(userId),
    getActivity(userId, now),
    getHistory(userId),
  ]);
  if (!identity) return null;
  return { identity, progress, unfinished, activity, history };
}
