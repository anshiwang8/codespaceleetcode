import "server-only";
import type { AchievementStatus, AchievementUnlock, AchievementsResponse, Difficulty, PuzzleType } from "@/lib/api-types";
import { ACHIEVEMENTS, type AchievementDefinition, type AchievementMetric } from "@/lib/achievements";
import { nextPeriodStart } from "@/lib/periods";
import { getPool } from "@/lib/server/db";
import { reconcileSolves } from "@/lib/server/scores";

// Achievements are worked out on the server from recorded activity only: the score ledger for
// solves, graded submissions for streaks, and challenge completions. Nothing the browser sends is
// counted. Evaluation runs after every graded submission and whenever the achievements are shown,
// so accounts older than this feature get theirs too, dated by when they were actually earned.
// The primary key on user_achievements makes each award happen once.

interface Facts {
  solves: { at: Date; difficulty: Difficulty; type: PuzzleType; repo: string; firstTry: boolean; hintFree: boolean }[];
  /** Each active UTC date with its first submission, oldest first. */
  activeDays: { day: string; at: Date }[];
  /** Daily completions, oldest first. */
  dailyCompletions: { day: string; at: Date }[];
  /** Completion times by kind, oldest first. */
  challenges: Record<"daily" | "weekly" | "monthly", Date[]>;
  publishedTypes: number;
}

async function loadFacts(userId: string): Promise<Facts> {
  const pool = getPool();
  const [solves, days, completions, types] = await Promise.all([
    pool.query<{
      earned_at: Date;
      difficulty: Difficulty;
      type: PuzzleType;
      repo: string;
      first_try: boolean;
      hint_free: boolean;
    }>(
      `select e.earned_at, p.difficulty, p.type, s.repo_id::text as repo, e.first_try,
              (not e.backfilled and e.hints_used = 0) as hint_free
         from score_events e
         join puzzles p on p.id = e.puzzle_id
         join snapshots s on s.id = p.snapshot_id
        where e.user_id = $1 and e.kind = 'solve' and p.published
        order by e.earned_at, e.id`,
      [userId],
    ),
    pool.query<{ day: string; at: Date }>(
      `select to_char((s.created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as day, min(s.created_at) as at
         from submissions s
         join puzzles p on p.id = s.puzzle_id
        where s.user_id = $1 and p.published
        group by 1
        order by 1`,
      [userId],
    ),
    pool.query<{ period_kind: "daily" | "weekly" | "monthly"; day: string; completed_at: Date }>(
      `select period_kind, to_char(period_start, 'YYYY-MM-DD') as day, completed_at
         from challenge_completions where user_id = $1
        order by completed_at`,
      [userId],
    ),
    pool.query<{ count: number }>("select count(distinct type)::int as count from puzzles where published"),
  ]);
  const challenges: Facts["challenges"] = { daily: [], weekly: [], monthly: [] };
  for (const row of completions.rows) challenges[row.period_kind].push(row.completed_at);
  return {
    solves: solves.rows.map((row) => ({
      at: row.earned_at,
      difficulty: row.difficulty,
      type: row.type,
      repo: row.repo,
      firstTry: row.first_try,
      hintFree: row.hint_free,
    })),
    activeDays: days.rows,
    dailyCompletions: completions.rows
      .filter((row) => row.period_kind === "daily")
      .map((row) => ({ day: row.day, at: row.completed_at }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    challenges,
    publishedTypes: types.rows[0]?.count ?? 0,
  };
}

interface Measured {
  progress: number;
  /** When the threshold was first reached, or null. */
  reachedAt: Date | null;
}

/** For counts: the moment the n-th event happened. */
function countToward(times: Date[], threshold: number): Measured {
  const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
  return { progress: Math.min(sorted.length, threshold), reachedAt: threshold > 0 ? (sorted[threshold - 1] ?? null) : null };
}

/** The first time of each distinct key, which is when that key started counting. */
function firstPerKey<T>(items: T[], key: (item: T) => string, at: (item: T) => Date): Date[] {
  const first = new Map<string, Date>();
  for (const item of items) {
    const k = key(item);
    const time = at(item);
    const known = first.get(k);
    if (!known || time < known) first.set(k, time);
  }
  return [...first.values()];
}

/** For runs of consecutive dates: the longest run, and when a run first reached `threshold`. */
function streakToward(days: { day: string; at: Date }[], threshold: number): Measured {
  let run = 0;
  let longest = 0;
  let previous: string | null = null;
  let reachedAt: Date | null = null;
  for (const { day, at } of days) {
    if (day === previous) continue;
    run = previous !== null && nextPeriodStart("daily", previous) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    if (reachedAt === null && run >= threshold) reachedAt = at;
    previous = day;
  }
  return { progress: Math.min(longest, threshold), reachedAt };
}

function resolveThreshold(definition: AchievementDefinition, facts: Facts): number {
  return definition.threshold === "all" ? Math.max(1, facts.publishedTypes) : definition.threshold;
}

function measure(metric: AchievementMetric, threshold: number, facts: Facts): Measured {
  switch (metric.kind) {
    case "solves":
      return countToward(
        facts.solves.filter((s) => !metric.difficulty || s.difficulty === metric.difficulty).map((s) => s.at),
        threshold,
      );
    case "repos":
      return countToward(firstPerKey(facts.solves, (s) => s.repo, (s) => s.at), threshold);
    case "types":
      return countToward(firstPerKey(facts.solves, (s) => s.type, (s) => s.at), threshold);
    case "first-try":
      return countToward(facts.solves.filter((s) => s.firstTry).map((s) => s.at), threshold);
    case "hint-free":
      return countToward(facts.solves.filter((s) => s.hintFree).map((s) => s.at), threshold);
    case "activity-streak":
      return streakToward(facts.activeDays, threshold);
    case "challenges":
      return countToward(facts.challenges[metric.period], threshold);
    case "challenge-streak":
      return streakToward(facts.dailyCompletions, threshold);
  }
}

export interface Evaluation {
  achievements: AchievementStatus[];
  /** Awarded by this evaluation, in list order. */
  unlocked: AchievementUnlock[];
}

/** Measures every achievement for this user and records the ones newly reached. */
export async function evaluateAchievements(userId: string): Promise<Evaluation> {
  await reconcileSolves(userId);
  const facts = await loadFacts(userId);
  const pool = getPool();
  const stored = await pool.query<{ achievement_id: string; unlocked_at: Date }>(
    "select achievement_id, unlocked_at from user_achievements where user_id = $1",
    [userId],
  );
  const earned = new Map(stored.rows.map((row) => [row.achievement_id, row.unlocked_at]));

  const measured = ACHIEVEMENTS.map((definition) => {
    const threshold = resolveThreshold(definition, facts);
    return { definition, threshold, ...measure(definition.metric, threshold, facts) };
  });

  const toAward = measured.filter(
    (m) => !m.definition.retired && m.reachedAt !== null && !earned.has(m.definition.id),
  );
  const unlocked: AchievementUnlock[] = [];
  if (toAward.length > 0) {
    const { rows } = await pool.query<{ achievement_id: string; unlocked_at: Date }>(
      `insert into user_achievements (user_id, achievement_id, unlocked_at)
       select $1::uuid, u.id, u.at from unnest($2::text[], $3::timestamptz[]) as u(id, at)
       on conflict do nothing
       returning achievement_id, unlocked_at`,
      [userId, toAward.map((m) => m.definition.id), toAward.map((m) => m.reachedAt)],
    );
    // Only rows this call inserted count as new; a concurrent evaluation may have won the others.
    const inserted = new Set(rows.map((row) => row.achievement_id));
    for (const row of rows) earned.set(row.achievement_id, row.unlocked_at);
    for (const m of toAward) {
      if (inserted.has(m.definition.id)) {
        unlocked.push({ id: m.definition.id, title: m.definition.title, description: m.definition.description });
      }
    }
    if (inserted.size < toAward.length) {
      const again = await pool.query<{ achievement_id: string; unlocked_at: Date }>(
        "select achievement_id, unlocked_at from user_achievements where user_id = $1",
        [userId],
      );
      for (const row of again.rows) earned.set(row.achievement_id, row.unlocked_at);
    }
  }

  const achievements = measured
    .filter((m) => !m.definition.retired || earned.has(m.definition.id))
    .map(({ definition, threshold, progress }): AchievementStatus => {
      const unlockedAt = earned.get(definition.id) ?? null;
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        category: definition.category,
        icon: definition.icon,
        threshold,
        progress: unlockedAt ? threshold : progress,
        unlockedAt: unlockedAt?.toISOString() ?? null,
      };
    });
  return { achievements, unlocked };
}

export async function getAchievements(userId: string): Promise<AchievementsResponse> {
  return { achievements: (await evaluateAchievements(userId)).achievements };
}
