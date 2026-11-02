import "server-only";
import { z } from "zod";
import type { AnswerKind, Submission, SubmitResponse } from "@/lib/api-types";
import { getPool, withTransaction } from "@/lib/server/db";
import { answerKeySchema, grade, parseLocationId } from "@/lib/server/grader";
import { LINE_BREAK_PATTERN } from "@/lib/server/code-index";
import { choicesSchema } from "@/lib/server/puzzles";

const idValue = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => !value.includes("\0"));
const idList = z.array(idValue).min(1).max(200);
const timeOnPuzzleMs = z.number().int().nonnegative().max(2_147_483_647).optional();

export const submissionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("symbol"), id: idValue, timeOnPuzzleMs }),
  z.strictObject({ kind: z.literal("file"), path: idValue, timeOnPuzzleMs }),
  z.strictObject({ kind: z.literal("location"), id: idValue, timeOnPuzzleMs }),
  z.strictObject({ kind: z.literal("sequence"), ids: idList, timeOnPuzzleMs }),
  z.strictObject({ kind: z.literal("set"), ids: idList, timeOnPuzzleMs }),
  z.strictObject({ kind: z.literal("choice"), option: idValue, timeOnPuzzleMs }),
]) satisfies z.ZodType<Submission>;

interface PuzzleToGrade {
  id: string;
  snapshot_id: string;
  answer_kind: AnswerKind;
  answer_json: unknown;
  choices: unknown;
}

/** The only query in the app that reads the key. The result must not leave this module. */
async function loadPuzzleToGrade(slug: string): Promise<PuzzleToGrade | null> {
  const { rows } = await getPool().query<PuzzleToGrade>(
    `select id, snapshot_id, answer_kind, answer_json, choices
       from puzzles
      where slug = $1 and published`,
    [slug],
  );
  return rows[0] ?? null;
}

async function allSymbolsExist(snapshotId: string, ids: string[]): Promise<boolean> {
  const { rows } = await getPool().query<{ symbol_id: string }>(
    "select symbol_id from symbols where snapshot_id = $1 and symbol_id = any ($2::text[])",
    [snapshotId, ids],
  );
  const found = new Set(rows.map((row) => row.symbol_id));
  return ids.every((id) => found.has(id));
}

async function allFilesExist(snapshotId: string, paths: string[]): Promise<boolean> {
  const { rows } = await getPool().query<{ path: string }>(
    "select path from files where snapshot_id = $1 and path = any ($2::text[])",
    [snapshotId, paths],
  );
  const found = new Set(rows.map((row) => row.path));
  return paths.every((path) => found.has(path));
}

async function locationExists(snapshotId: string, id: string): Promise<boolean> {
  const location = parseLocationId(id);
  if (!location) return false;
  const { rows } = await getPool().query<{ line_count: number }>(
    `select regexp_count(content, $3) + 1 as line_count
       from files
      where snapshot_id = $1 and path = $2`,
    [snapshotId, location.path, LINE_BREAK_PATTERN],
  );
  const lineCount = rows[0]?.line_count;
  return lineCount !== undefined && location.end <= lineCount;
}

async function setMembersExist(snapshotId: string, ids: string[]): Promise<boolean> {
  const { rows } = await getPool().query<{ id: string }>(
    `select symbol_id as id from symbols where snapshot_id = $1 and symbol_id = any ($2::text[])
     union
     select path as id from files where snapshot_id = $1 and path = any ($2::text[])`,
    [snapshotId, ids],
  );
  const found = new Set(rows.map((row) => row.id));
  return ids.every((id) => found.has(id));
}

async function referencesExist(puzzle: PuzzleToGrade, submission: Submission): Promise<boolean> {
  const snapshotId = puzzle.snapshot_id;
  switch (submission.kind) {
    case "symbol":
      return allSymbolsExist(snapshotId, [submission.id]);
    case "sequence":
      return allSymbolsExist(snapshotId, submission.ids);
    case "file":
      return allFilesExist(snapshotId, [submission.path]);
    case "location":
      return locationExists(snapshotId, submission.id);
    case "set":
      return setMembersExist(snapshotId, submission.ids);
    case "choice": {
      const choices = choicesSchema.parse(puzzle.choices) ?? [];
      return choices.some((choice) => choice.id === submission.option);
    }
  }
}

export type SubmitResult =
  | { state: "not_found" }
  | { state: "wrong_kind" }
  | { state: "unknown_reference" }
  | { state: "graded"; response: SubmitResponse };

export async function submitAnswer(
  userId: string,
  slug: string,
  submission: Submission,
): Promise<SubmitResult> {
  const puzzle = await loadPuzzleToGrade(slug);
  if (!puzzle) return { state: "not_found" };
  // The expected kind is public: it's in GET /api/puzzles/:slug.
  if (submission.kind !== puzzle.answer_kind) return { state: "wrong_kind" };
  if (!(await referencesExist(puzzle, submission))) return { state: "unknown_reference" };

  const key = answerKeySchema.safeParse(puzzle.answer_json);
  // Log the puzzle only: a zod error can describe the key's contents.
  if (!key.success || key.data.kind !== puzzle.answer_kind) {
    throw new Error(`Puzzle ${puzzle.id} has a malformed answer key`);
  }
  const correct = grade(key.data, submission);

  const { timeOnPuzzleMs: elapsedMs, ...answer } = submission;
  const attempts = await withTransaction(async (client) => {
    await client.query(
      `insert into submissions (user_id, puzzle_id, answer_json, correct, time_on_puzzle_ms)
       values ($1, $2, $3::jsonb, $4, $5)`,
      [userId, puzzle.id, JSON.stringify(answer), correct, elapsedMs ?? null],
    );
    // One statement, so concurrent submissions can't lose a count. `solved` is final.
    const { rows } = await client.query<{ attempts: number }>(
      `insert into progress (user_id, puzzle_id, status, attempts, solved_at)
       values ($1, $2, case when $3::boolean then 'solved' else 'attempted' end, 1,
               case when $3::boolean then now() end)
       on conflict (user_id, puzzle_id) do update
         set attempts = progress.attempts + 1,
             status = case
               when progress.status = 'solved' then progress.status
               when $3::boolean then 'solved'
               else 'attempted'
             end,
             solved_at = case
               when progress.status = 'attempted' and $3::boolean then now()
               else progress.solved_at
             end
       returning attempts`,
      [userId, puzzle.id, correct],
    );
    const count = rows[0]?.attempts;
    if (count === undefined) throw new Error("progress upsert returned no row");
    return count;
  });
  return { state: "graded", response: { correct, attempts } };
}
