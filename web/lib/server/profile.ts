import "server-only";
import {
  PUZZLE_TYPES,
  type ActivityDay,
  type ActivityPeriodKey,
  type ActivityResponse,
  type Difficulty,
  type HistoryEntry,
  type HistoryFilters,
  type HistoryPage,
  type PracticeStreaks,
  type ProfileActivity,
  type ProfileIdentity,
  type ProfileProgress,
  type ProfileResponse,
  type ProgressCount,
  type PuzzleType,
  type SolveTimeline,
  type UnfinishedPuzzle,
} from "@/lib/api-types";
import { orderTags } from "@/lib/browse";
import { getPool } from "@/lib/server/db";
import { storedLinks } from "@/lib/server/settings";

// The profile's data. Every query here is scoped to one user id, which callers take from
// getCurrentUser, and counts only published puzzles. Nothing here reads an answer key, a submitted
// answer, a solution, a token or the stored email.

/** How many dates the default activity period covers, ending today. */
export const ROLLING_DAYS = 365;
export const ROLLING_LABEL = "Last 365 days";
/** Activity is grouped into days in this zone, so a day means the same thing for everyone. */
export const ACTIVITY_TIME_ZONE = "UTC";
export const HISTORY_PAGE_SIZE = 10;
export const HISTORY_MAX_PAGE_SIZE = 50;
export const UNFINISHED_LIMIT = 6;

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
export function summarizeProgress(rows: ProgressRow[], submissions = 0): ProfileProgress {
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
    submissions,
    byType,
    byDifficulty,
    byRepo: [...repos.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "en-US"))
      .map(([repo, { language, count }]) => ({ repo, language, ...count })),
    byTopic: orderTags(topics.keys()).map((topic) => ({ topic, ...(topics.get(topic) ?? zero()) })),
  };
}

const DAY_MS = 86_400_000;

/** YYYY-MM-DD of a moment, in UTC. */
export function utcDate(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/** A YYYY-MM-DD date moved by whole days. Plain UTC arithmetic, so no zone or DST can shift it. */
export function addDays(date: string, days: number): string {
  return utcDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS));
}

/** Every date from `start` to `end`, inclusive, oldest first. */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export interface ActivityPeriod {
  key: ActivityPeriodKey;
  label: string;
  start: string;
  end: string;
}

/** "rolling" or a four-digit year from a query string. Anything else is null. */
export function parsePeriodKey(value: string | undefined): ActivityPeriodKey | null {
  if (value === undefined || value === "rolling") return "rolling";
  return /^(19|20)[0-9]{2}$/.test(value) ? (value as ActivityPeriodKey) : null;
}

/** The dates a period covers. Rolling is 365 dates ending today; a year is all of its 365 or 366. */
export function resolvePeriod(key: ActivityPeriodKey, today: string): ActivityPeriod {
  if (key === "rolling") {
    return { key, label: ROLLING_LABEL, start: addDays(today, -(ROLLING_DAYS - 1)), end: today };
  }
  return { key, label: key, start: `${key}-01-01`, end: `${key}-12-31` };
}

/** The calendar years a user can pick: from the year their history starts through this year. */
export function selectableYears(historyStart: string, today: string): number[] {
  const first = Number(historyStart.slice(0, 4));
  const last = Number(today.slice(0, 4));
  return Array.from({ length: Math.max(last - first + 1, 1) }, (_, index) => Math.min(first, last) + index);
}

/**
 * One entry per date of the period. A date after today, or before the account's history starts,
 * is unavailable: there was no chance to practice, so it isn't shown as a zero.
 */
export function buildActivity(
  period: ActivityPeriod,
  today: string,
  historyStart: string,
  counted: { date: string; submissions: number; passed: number }[],
): ProfileActivity {
  const byDate = new Map(counted.map((day) => [day.date, day]));
  const days: ActivityDay[] = datesBetween(period.start, period.end).map((date) => {
    const available = date <= today && date >= historyStart;
    const found = available ? byDate.get(date) : undefined;
    return { date, submissions: found?.submissions ?? 0, passed: found?.passed ?? 0, available };
  });
  return {
    timeZone: ACTIVITY_TIME_ZONE,
    period: period.key,
    label: period.label,
    start: period.start,
    end: period.end,
    today,
    days,
    activeDays: days.filter((day) => day.submissions > 0).length,
    submissions: days.reduce((sum, day) => sum + day.submissions, 0),
    years: selectableYears(historyStart, today),
  };
}

/**
 * Streaks from the most recent run of consecutive active dates and the longest run. The current
 * streak survives a day with no submissions yet: if yesterday was active, today is still open.
 */
export function streaksFrom(
  run: { lastDay: string | null; lastLength: number; longest: number },
  today: string,
  submissionsToday: number,
): PracticeStreaks {
  const live = run.lastDay === today || run.lastDay === addDays(today, -1);
  return { current: live ? run.lastLength : 0, longest: run.longest, submissionsToday, today };
}

/** First solves split into those before the period (the baseline) and those inside it. */
export function buildTimeline(period: ActivityPeriod, firstSolves: { date: string; count: number }[]): SolveTimeline {
  const sorted = [...firstSolves].sort((a, b) => a.date.localeCompare(b.date));
  return {
    start: period.start,
    end: period.end,
    baseline: sorted.filter((day) => day.date < period.start).reduce((sum, day) => sum + day.count, 0),
    solves: sorted.filter((day) => day.date >= period.start && day.date <= period.end),
  };
}

async function getIdentity(userId: string): Promise<ProfileIdentity | null> {
  // The display name, pronouns, bio, links and avatar are codebases' own (user_profiles,
  // user_avatars), never Better Auth's GitHub-derived name or image, so a sign-in can't change them.
  const { rows } = await getPool().query<{
    github_login: string;
    created_at: Date;
    has_github: boolean;
    display_name: string | null;
    pronouns: string | null;
    bio: string | null;
    links: unknown;
    avatar_version: string | null;
  }>(
    `select u.github_login, u.created_at, p.display_name, p.pronouns, p.bio, p.links,
            av.version as avatar_version,
            exists (
              select 1 from auth_accounts ac where ac.user_id = u.id and ac.provider_id = 'github'
            ) as has_github
       from users u
       left join user_profiles p on p.user_id = u.id
       left join user_avatars av on av.user_id = u.id
      where u.id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  const provider = row.has_github ? "github" : "dev";
  return {
    login: row.github_login,
    displayName: row.display_name,
    pronouns: row.pronouns,
    bio: row.bio,
    links: storedLinks(row.links ?? {}),
    avatarVersion: row.avatar_version,
    provider,
    memberSince: row.created_at.toISOString(),
    githubUrl: provider === "github" ? `https://github.com/${encodeURIComponent(row.github_login)}` : null,
  };
}

async function getProgress(userId: string): Promise<ProfileProgress> {
  const pool = getPool();
  const [puzzles, submissions] = await Promise.all([
    pool.query<ProgressRow>(
      `select p.type, p.difficulty, p.tags, r.slug as repo_slug, r.language, pr.status
         from puzzles p
         join snapshots s on s.id = p.snapshot_id
         join repos r on r.id = s.repo_id
         left join progress pr on pr.puzzle_id = p.id and pr.user_id = $1
        where p.published`,
      [userId],
    ),
    pool.query<{ count: number }>(
      `select count(*)::int as count
         from submissions s
         join puzzles p on p.id = s.puzzle_id
        where s.user_id = $1 and p.published`,
      [userId],
    ),
  ]);
  return summarizeProgress(puzzles.rows, submissions.rows[0]?.count ?? 0);
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

/**
 * The first date of the user's history: the account's creation date, or an earlier submission's
 * date if one predates it (accounts carried over from before migration 0005). Null if no user.
 */
async function getHistoryStart(userId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ start: string }>(
    `select to_char(
              least(
                u.created_at,
                coalesce(
                  (select min(s.created_at)
                     from submissions s
                     join puzzles p on p.id = s.puzzle_id
                    where s.user_id = u.id and p.published),
                  u.created_at
                )
              ) at time zone 'UTC',
              'YYYY-MM-DD'
            ) as start
       from users u
      where u.id = $1`,
    [userId],
  );
  return rows[0]?.start ?? null;
}

/** Graded submissions per UTC date from `start` to `end`, never past `today`. One query. */
async function getDailyCounts(
  userId: string,
  start: string,
  end: string,
  today: string,
): Promise<{ date: string; submissions: number; passed: number }[]> {
  const last = end < today ? end : today;
  if (last < start) return [];
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
    [userId, start, last],
  );
  return rows;
}

/**
 * Lifetime streaks in one query: distinct active UTC dates up to today, grouped into runs of
 * consecutive dates (a date minus its row number is constant along a run).
 */
async function getStreaks(userId: string, today: string): Promise<PracticeStreaks> {
  const { rows } = await getPool().query<{
    longest: number | null;
    last_day: string | null;
    last_length: number | null;
    today_count: number;
  }>(
    `with active as (
       select distinct (s.created_at at time zone 'UTC')::date as day
         from submissions s
         join puzzles p on p.id = s.puzzle_id
        where s.user_id = $1
          and p.published
          and s.created_at < ($2::date + 1)::timestamp at time zone 'UTC'
     ), runs as (
       select max(day) as last_day, count(*)::int as length
         from (select day, day - (row_number() over (order by day))::int as run from active) numbered
        group by run
     )
     select (select max(length) from runs) as longest,
            (select to_char(last_day, 'YYYY-MM-DD') from runs order by last_day desc limit 1) as last_day,
            (select length from runs order by last_day desc limit 1) as last_length,
            (select count(*)::int
               from submissions s
               join puzzles p on p.id = s.puzzle_id
              where s.user_id = $1
                and p.published
                and s.created_at >= ($2::date)::timestamp at time zone 'UTC'
                and s.created_at < ($2::date + 1)::timestamp at time zone 'UTC') as today_count`,
    [userId, today],
  );
  const row = rows[0];
  return streaksFrom(
    { lastDay: row?.last_day ?? null, lastLength: row?.last_length ?? 0, longest: row?.longest ?? 0 },
    today,
    row?.today_count ?? 0,
  );
}

/**
 * Each solved, published puzzle once, dated by its first correct submission. Counting only
 * puzzles whose status is solved keeps the chart's total equal to the solved count; a solve with
 * no recorded correct submission falls back to `progress.solved_at`.
 */
async function getFirstSolves(userId: string, today: string): Promise<{ date: string; count: number }[]> {
  const { rows } = await getPool().query<{ date: string; count: number }>(
    `select to_char(coalesce(first.at, pr.solved_at) at time zone 'UTC', 'YYYY-MM-DD') as date,
            count(*)::int as count
       from progress pr
       join puzzles p on p.id = pr.puzzle_id
       left join lateral (
         select min(s.created_at) as at
           from submissions s
          where s.user_id = pr.user_id and s.puzzle_id = pr.puzzle_id and s.correct
       ) first on true
      where pr.user_id = $1
        and pr.status = 'solved'
        and p.published
        and coalesce(first.at, pr.solved_at) < ($2::date + 1)::timestamp at time zone 'UTC'
      group by 1`,
    [userId, today],
  );
  return rows;
}

/** The activity calendar and first-solve timeline for one period, or null for a year the user can't pick. */
export async function getActivity(
  userId: string,
  key: ActivityPeriodKey,
  now: Date = new Date(),
): Promise<ActivityResponse | null> {
  const today = utcDate(now);
  const historyStart = await getHistoryStart(userId);
  if (!historyStart) return null;
  if (key !== "rolling" && !selectableYears(historyStart, today).includes(Number(key))) return null;
  const period = resolvePeriod(key, today);
  const [counts, firstSolves] = await Promise.all([
    getDailyCounts(userId, period.start, period.end, today),
    getFirstSolves(userId, today),
  ]);
  return { activity: buildActivity(period, today, historyStart, counts), timeline: buildTimeline(period, firstSolves) };
}

/**
 * The user's graded submissions, newest first, one page at a time. `before` is the `id` of the
 * last entry already shown; the next page starts after that submission's (created_at, id), so a
 * submission made while paging can't shift a page or repeat an entry. A cursor that isn't one of
 * this user's submissions matches nothing, so it gives an empty page rather than someone else's.
 */
export async function getHistory(
  userId: string,
  options: { before?: string | null; limit?: number } & HistoryFilters = {},
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
        and ($4::text is null or p.type = $4)
        and ($5::text is null or p.difficulty = $5)
        and ($6::text is null or r.slug = $6)
        and ($7::boolean is null or s.correct = $7)
        and (
          $8::date is null
          or (
            s.created_at >= ($8::date)::timestamp at time zone 'UTC'
            and s.created_at < ($8::date + 1)::timestamp at time zone 'UTC'
          )
        )
      order by s.created_at desc, s.id desc
      limit $3`,
    [
      userId,
      options.before ?? null,
      limit + 1,
      options.type ?? null,
      options.difficulty ?? null,
      options.repo ?? null,
      options.outcome === undefined ? null : options.outcome === "passed",
      options.date ?? null,
    ],
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
  const today = utcDate(now);
  const [identity, progress, unfinished, activity, streaks, history] = await Promise.all([
    getIdentity(userId),
    getProgress(userId),
    getUnfinished(userId),
    getActivity(userId, "rolling", now),
    getStreaks(userId, today),
    getHistory(userId),
  ]);
  if (!identity || !activity) return null;
  return { identity, progress, unfinished, activity: activity.activity, streaks, timeline: activity.timeline, history };
}
