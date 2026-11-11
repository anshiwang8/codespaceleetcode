import "server-only";
import type { PoolClient } from "pg";
import type {
  ChallengeArchiveResponse,
  ChallengeCard,
  ChallengeStreak,
  ChallengesResponse,
  Difficulty,
  PuzzleStatus,
  PuzzleType,
} from "@/lib/api-types";
import {
  PERIOD_KINDS,
  currentPeriod,
  describePeriod,
  nextPeriodStart,
  periodRange,
  periodStart,
  type PeriodKind,
} from "@/lib/periods";
import { SCORING } from "@/lib/scoring";
import { getPool, withTransaction } from "@/lib/server/db";

// Recurring challenges (spec section 10, "Challenges"). Each period's puzzle is chosen by the
// server the first time anyone needs it and stored in challenge_assignments, so everyone sees the
// same one and it never changes for the rest of the period. A row can also be inserted by hand to
// curate a period ahead of time; selection only fills periods with no row.

/** Which difficulties each kind draws from. Later kinds are harder. */
const POOLS: Record<PeriodKind, Difficulty[]> = {
  daily: ["easy", "medium"],
  weekly: ["medium"],
  monthly: ["hard"],
};
/** How far back a gap is filled, so the archive has no holes after a quiet stretch. */
const MAX_FILL: Record<PeriodKind, number> = { daily: 120, weekly: 26, monthly: 12 };
export const ARCHIVE_PAGE_SIZE = 20;

/** The server's clock, from the database, so every instance agrees on which period is open. */
export async function databaseNow(): Promise<Date> {
  const { rows } = await getPool().query<{ now: Date }>("select now() as now");
  const now = rows[0]?.now;
  if (!now) throw new Error("select now() returned no row");
  return now;
}

/**
 * The least recently featured published puzzle from the kind's pool (never featured comes first),
 * with a hash of the period breaking ties, so the choice is deterministic and spreads across
 * repositories instead of following the seed order. Falls back to any published puzzle.
 */
async function choosePuzzle(client: PoolClient, kind: PeriodKind, start: string): Promise<string | null> {
  for (const pool of [POOLS[kind], null]) {
    const { rows } = await client.query<{ id: string }>(
      `select p.id
         from puzzles p
         left join lateral (
           select max(a.period_start) as last from challenge_assignments a where a.puzzle_id = p.id
         ) used on true
        where p.published and ($1::text[] is null or p.difficulty = any ($1::text[]))
        order by used.last nulls first, md5($2 || p.slug)
        limit 1`,
      [pool, `${kind}:${start}`],
    );
    const id = rows[0]?.id;
    if (id) return id;
  }
  return null;
}

/**
 * Makes sure every kind has a puzzle for the period containing `now`, filling any periods skipped
 * since the last one. Serialized by an advisory lock, and a no-op once the rows exist.
 */
export async function ensureAssignments(now: Date): Promise<void> {
  const currents = PERIOD_KINDS.map((kind) => ({ kind, start: periodStart(kind, now) }));
  const existing = await getPool().query<{ count: number }>(
    `select count(*)::int as count from challenge_assignments
      where (period_kind, period_start) in (select u.kind, u.start from unnest($1::text[], $2::date[]) as u(kind, start))`,
    [currents.map((c) => c.kind), currents.map((c) => c.start)],
  );
  if (existing.rows[0]?.count === currents.length) return;

  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('challenge-assignments'))");
    for (const { kind, start: current } of currents) {
      const latest = await client.query<{ start: string | null }>(
        `select to_char(max(period_start), 'YYYY-MM-DD') as start
           from challenge_assignments where period_kind = $1 and period_start <= $2::date`,
        [kind, current],
      );
      const last = latest.rows[0]?.start ?? null;
      const starts: string[] = [];
      if (last === null) {
        starts.push(current);
      } else {
        for (let s = nextPeriodStart(kind, last); s <= current; s = nextPeriodStart(kind, s)) starts.push(s);
      }
      for (const start of starts.slice(-MAX_FILL[kind])) {
        const puzzleId = await choosePuzzle(client, kind, start);
        if (!puzzleId) return; // Nothing is published, so there's nothing to feature.
        await client.query(
          `insert into challenge_assignments (period_kind, period_start, puzzle_id)
           values ($1, $2::date, $3) on conflict do nothing`,
          [kind, start, puzzleId],
        );
      }
    }
  });
}

interface CardRow {
  period_kind: PeriodKind;
  period_start: string;
  slug: string | null;
  title: string | null;
  type: PuzzleType | null;
  difficulty: Difficulty | null;
  repo_slug: string | null;
  completed_at: Date | null;
  status: PuzzleStatus;
}

const CARD_SELECT = `
  select a.period_kind, to_char(a.period_start, 'YYYY-MM-DD') as period_start,
         p.slug, p.title, p.type, p.difficulty, r.slug as repo_slug,
         c.completed_at,
         coalesce(pr.status, 'unsolved') as status
    from challenge_assignments a
    left join puzzles p on p.id = a.puzzle_id and p.published
    left join snapshots s on s.id = p.snapshot_id
    left join repos r on r.id = s.repo_id
    left join challenge_completions c
      on c.period_kind = a.period_kind and c.period_start = a.period_start and c.user_id = $1
    left join progress pr on pr.puzzle_id = p.id and pr.user_id = $1`;

function toCard(row: CardRow): ChallengeCard {
  const range = periodRange(row.period_kind, row.period_start);
  return {
    kind: row.period_kind,
    periodStart: row.period_start,
    label: describePeriod(row.period_kind, row.period_start),
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    puzzle:
      row.slug && row.title && row.type && row.difficulty && row.repo_slug
        ? { slug: row.slug, title: row.title, type: row.type, difficulty: row.difficulty, repoSlug: row.repo_slug }
        : null,
    bonus: SCORING.challengeBonus[row.period_kind],
    completed: row.completed_at !== null,
    completedAt: row.completed_at?.toISOString() ?? null,
    status: row.slug ? row.status : "unsolved",
  };
}

/** Consecutive UTC dates with a daily completion, with the same "today or yesterday" rule as the profile. */
export function challengeStreakFrom(days: string[], today: string): ChallengeStreak {
  const sorted = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && nextPeriodStart("daily", previous) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  const yesterday = periodStart("daily", new Date(Date.parse(`${today}T00:00:00Z`) - 1));
  const live = previous === today || previous === yesterday;
  return { current: live ? run : 0, longest, completedToday: previous === today };
}

export async function getChallengeStreak(userId: string, now: Date): Promise<ChallengeStreak> {
  const { rows } = await getPool().query<{ day: string }>(
    `select to_char(period_start, 'YYYY-MM-DD') as day from challenge_completions
      where user_id = $1 and period_kind = 'daily' and period_start <= $2::date
      order by period_start`,
    [userId, periodStart("daily", now)],
  );
  return challengeStreakFrom(
    rows.map((row) => row.day),
    periodStart("daily", now),
  );
}

export async function getChallenges(userId: string | null, now?: Date): Promise<ChallengesResponse> {
  const at = now ?? (await databaseNow());
  await ensureAssignments(at);
  const currents = PERIOD_KINDS.map((kind) => currentPeriod(kind, at));
  const { rows } = await getPool().query<CardRow>(
    `${CARD_SELECT}
      where (a.period_kind, a.period_start) in (select u.kind, u.start from unnest($2::text[], $3::date[]) as u(kind, start))`,
    [userId, currents.map((c) => c.kind), currents.map((c) => c.start)],
  );
  const byKind = new Map(rows.map((row) => [row.period_kind, toCard(row)]));
  const current = PERIOD_KINDS.flatMap((kind) => byKind.get(kind) ?? []);

  if (!userId) return { now: at.toISOString(), current, streak: null, completedCounts: null };
  const [streak, counts] = await Promise.all([
    getChallengeStreak(userId, at),
    getPool().query<{ period_kind: PeriodKind; count: number }>(
      `select period_kind, count(*)::int as count from challenge_completions
        where user_id = $1 group by period_kind`,
      [userId],
    ),
  ]);
  const completedCounts = { daily: 0, weekly: 0, monthly: 0 };
  for (const row of counts.rows) completedCounts[row.period_kind] = row.count;
  return { now: at.toISOString(), current, streak, completedCounts };
}

/** Past periods of one kind, newest first, before `before` (a period start) or the current one. */
export async function getChallengeArchive(
  userId: string | null,
  kind: PeriodKind,
  before: string | null,
  now?: Date,
): Promise<ChallengeArchiveResponse> {
  const at = now ?? (await databaseNow());
  await ensureAssignments(at);
  const current = periodStart(kind, at);
  const limit = before !== null && before < current ? before : current;
  const { rows } = await getPool().query<CardRow>(
    `${CARD_SELECT}
      where a.period_kind = $2 and a.period_start < $3::date
      order by a.period_start desc
      limit $4`,
    [userId, kind, limit, ARCHIVE_PAGE_SIZE + 1],
  );
  const items = rows.slice(0, ARCHIVE_PAGE_SIZE).map(toCard);
  return {
    kind,
    items,
    nextBefore: rows.length > ARCHIVE_PAGE_SIZE ? (items.at(-1)?.periodStart ?? null) : null,
  };
}

/**
 * Inside a correct submission's transaction: records a completion for every open period whose
 * puzzle this is. `now` is when the submission was graded, from the database's clock. A period
 * that has closed never matches, so practicing an old challenge earns no challenge reward.
 */
export async function recordChallengeCompletions(
  client: PoolClient,
  userId: string,
  puzzleId: string,
  now: Date,
): Promise<{ kind: PeriodKind; start: string }[]> {
  const kinds = [...PERIOD_KINDS];
  const starts = kinds.map((kind) => periodStart(kind, now));
  const { rows } = await client.query<{ period_kind: PeriodKind; period_start: string }>(
    `insert into challenge_completions (user_id, period_kind, period_start, completed_at)
     select $1, a.period_kind, a.period_start, $5
       from challenge_assignments a
      where a.puzzle_id = $2
        and (a.period_kind, a.period_start) in (select u.kind, u.start from unnest($3::text[], $4::date[]) as u(kind, start))
     on conflict do nothing
     returning period_kind, to_char(period_start, 'YYYY-MM-DD') as period_start`,
    [userId, puzzleId, kinds, starts, now],
  );
  return rows.map((row) => ({ kind: row.period_kind, start: row.period_start }));
}
