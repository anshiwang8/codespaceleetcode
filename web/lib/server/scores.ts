import "server-only";
import type { PoolClient } from "pg";
import type { Difficulty } from "@/lib/api-types";
import type { PeriodKind } from "@/lib/periods";
import { SCORING, scoreSolve } from "@/lib/scoring";
import { getPool } from "@/lib/server/db";

// The points ledger (score_events, migration 0009). Rows are only ever inserted, by the server,
// from graded submissions. The partial unique indexes make each insert happen at most once, so a
// repeated or concurrent correct submission can't score twice.

/**
 * Inside a correct submission's transaction: the solve's points, the first time this user solves
 * this puzzle. Returns the points, or 0 when the puzzle was already scored.
 */
export async function recordSolve(
  client: PoolClient,
  input: { userId: string; puzzleId: string; difficulty: Difficulty; firstTry: boolean; now: Date },
): Promise<number> {
  const { rows: hintRows } = await client.query<{ count: number }>(
    "select count(*)::int as count from hint_reveals where user_id = $1 and puzzle_id = $2",
    [input.userId, input.puzzleId],
  );
  const hintsUsed = hintRows[0]?.count ?? 0;
  const score = scoreSolve(input.difficulty, input.firstTry, hintsUsed);
  const { rows } = await client.query<{ points: number }>(
    `insert into score_events (user_id, puzzle_id, kind, base_points, first_try_bonus, hint_penalty,
                               points, hints_used, first_try, earned_at)
     values ($1, $2, 'solve', $3, $4, $5, $6, $7, $8, $9)
     on conflict do nothing
     returning points`,
    [
      input.userId,
      input.puzzleId,
      score.basePoints,
      score.firstTryBonus,
      score.hintPenalty,
      score.points,
      hintsUsed,
      input.firstTry,
      input.now,
    ],
  );
  return rows[0]?.points ?? 0;
}

/** Inside the same transaction: a completed challenge period's bonus. Returns the points awarded. */
export async function recordChallengeBonus(
  client: PoolClient,
  input: { userId: string; puzzleId: string; kind: PeriodKind; start: string; now: Date },
): Promise<number> {
  const bonus = SCORING.challengeBonus[input.kind];
  const { rows } = await client.query<{ points: number }>(
    `insert into score_events (user_id, puzzle_id, kind, period_kind, period_start, base_points,
                               points, earned_at)
     values ($1, $2, 'challenge', $3, $4::date, $5, $5, $6)
     on conflict do nothing
     returning points`,
    [input.userId, input.puzzleId, input.kind, input.start, bonus, input.now],
  );
  return rows[0]?.points ?? 0;
}

/**
 * Adds a backfilled solve row for any puzzle the user has solved without one, as migration 0009
 * did for everyone. A changed answer key can mark a puzzle solved during seeding, outside submit.
 * Same rule as the migration: base points, the first-try bonus when the history shows it, no hint
 * deduction, dated by the first correct submission.
 */
export async function reconcileSolves(userId: string): Promise<void> {
  await getPool().query(
    `insert into score_events (user_id, puzzle_id, kind, base_points, first_try_bonus, hint_penalty,
                               points, hints_used, first_try, backfilled, earned_at)
     select pr.user_id, pr.puzzle_id, 'solve', base.points,
            case when first_sub.correct then $2::int else 0 end, 0,
            greatest($3::int, base.points + case when first_sub.correct then $2::int else 0 end),
            0, coalesce(first_sub.correct, false), true,
            coalesce(first_correct.created_at, pr.solved_at, now())
       from progress pr
       join puzzles p on p.id = pr.puzzle_id
       cross join lateral (
         select ($4::jsonb ->> p.difficulty)::int as points
       ) base
       left join lateral (
         select s.correct from submissions s
          where s.user_id = pr.user_id and s.puzzle_id = pr.puzzle_id
          order by s.created_at, s.id limit 1
       ) first_sub on true
       left join lateral (
         select s.created_at from submissions s
          where s.user_id = pr.user_id and s.puzzle_id = pr.puzzle_id and s.correct
          order by s.created_at, s.id limit 1
       ) first_correct on true
      where pr.user_id = $1 and pr.status = 'solved'
        and not exists (
          select 1 from score_events e
           where e.user_id = pr.user_id and e.puzzle_id = pr.puzzle_id and e.kind = 'solve'
        )
     on conflict do nothing`,
    [userId, SCORING.firstTryBonus, SCORING.minimum, JSON.stringify(SCORING.base)],
  );
}
