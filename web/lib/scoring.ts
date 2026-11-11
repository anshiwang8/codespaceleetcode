// The one scoring system (spec section 10, "Scoring"). The server applies it when a correct
// submission is recorded; the leaderboard and the explanation on /leaderboard read these values.
// Migration 0009's backfill repeats the solve values in SQL, and web/tests/scoring.test.ts checks
// the two agree.

import type { Difficulty } from "@/lib/api-types";
import type { PeriodKind } from "@/lib/periods";

export const SCORING = {
  /** Points for solving a puzzle for the first time, by difficulty. */
  base: { easy: 100, medium: 200, hard: 300 } satisfies Record<Difficulty, number>,
  /** Added when the first graded submission to the puzzle was the correct one. */
  firstTryBonus: 25,
  /** Taken off for each hint revealed before the solve. Hints revealed afterward cost nothing. */
  hintPenalty: 20,
  /** No legitimate solve earns less than this. */
  minimum: 25,
  /** Extra points for solving a challenge's puzzle while its period is open. Once per period. */
  challengeBonus: { daily: 50, weekly: 100, monthly: 200 } satisfies Record<PeriodKind, number>,
} as const;

export interface SolveScore {
  basePoints: number;
  firstTryBonus: number;
  hintPenalty: number;
  points: number;
}

export function scoreSolve(difficulty: Difficulty, firstTry: boolean, hintsUsed: number): SolveScore {
  const basePoints = SCORING.base[difficulty];
  const firstTryBonus = firstTry ? SCORING.firstTryBonus : 0;
  const hintPenalty = Math.max(0, Math.min(3, hintsUsed)) * SCORING.hintPenalty;
  const points = Math.max(SCORING.minimum, basePoints + firstTryBonus - hintPenalty);
  return { basePoints, firstTryBonus, hintPenalty, points };
}
