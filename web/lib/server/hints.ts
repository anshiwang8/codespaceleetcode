import "server-only";
import { z } from "zod";
import type { HintRevealResponse } from "@/lib/api-types";
import { getPool } from "@/lib/server/db";

// Hints are revealed one level at a time and recorded before their text is sent, so the record
// that scoring reads (web/lib/scoring.ts) can't be skipped. The client never sees an unrevealed
// hint: puzzle pages carry only the count and the hints this user has revealed.

export const MAX_HINT_LEVELS = 3;
const hintsSchema = z.array(z.string()).max(MAX_HINT_LEVELS);

export function parseHints(value: unknown): string[] {
  return hintsSchema.parse(value);
}

export const hintRevealSchema = z.strictObject({ level: z.number().int().min(1).max(MAX_HINT_LEVELS) });

export type HintRevealResult =
  | { state: "not_found" }
  | { state: "no_such_level" }
  | { state: "out_of_order" }
  | { state: "ok"; response: HintRevealResponse };

/** How many levels this user has revealed on a puzzle. Levels are always revealed in order. */
export async function revealedHintCount(userId: string, puzzleId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: number }>(
    "select count(*)::int as count from hint_reveals where user_id = $1 and puzzle_id = $2",
    [userId, puzzleId],
  );
  return rows[0]?.count ?? 0;
}

/**
 * Reveals hint `level` (1-based) for this user. Asking again for a level already revealed returns
 * the same hints and records nothing new. A level can only follow the one before it: the insert's
 * condition counts the earlier levels in the same statement, so concurrent requests can't skip one.
 */
export async function revealHint(userId: string, slug: string, level: number): Promise<HintRevealResult> {
  const pool = getPool();
  const puzzle = await pool.query<{ id: string; hints: unknown }>(
    "select id, hints from puzzles where slug = $1 and published",
    [slug],
  );
  const row = puzzle.rows[0];
  if (!row) return { state: "not_found" };
  const hints = parseHints(row.hints);
  if (level > hints.length) return { state: "no_such_level" };

  await pool.query(
    `insert into hint_reveals (user_id, puzzle_id, level)
     select $1::uuid, $2::bigint, $3::smallint
      where (select count(*) from hint_reveals where user_id = $1::uuid and puzzle_id = $2::bigint) = $3::int - 1
     on conflict do nothing`,
    [userId, row.id, level],
  );
  const revealed = await revealedHintCount(userId, row.id);
  if (revealed < level) return { state: "out_of_order" };
  return { state: "ok", response: { hintCount: hints.length, revealedHints: hints.slice(0, revealed) } };
}
