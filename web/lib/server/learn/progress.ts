import "server-only";
import type { LearnProgressResponse, LessonProgress } from "@/lib/learn/types";
import { getPool } from "@/lib/server/db";

// The signed-in user's Learn progress (migration 0010). Every function takes the user's id from
// the caller, who got it from getCurrentUser, and touches only that user's rows. A row records
// which required exercises of one lesson revision were graded correct, and when the last of them
// was. Only POST /api/learn/:slug/check calls recordCorrect, after grade() said the answer was right.

/**
 * Adds one correct required exercise, and completes the lesson when that was the last one
 * missing. One statement, so two checks landing at once can't both miss the completion.
 */
export async function recordCorrect(
  userId: string,
  slug: string,
  revision: number,
  exerciseId: string,
  requiredIds: readonly string[],
): Promise<LessonProgress> {
  const { rows } = await getPool().query<{ correct: string[]; completed_at: Date | null }>(
    `insert into learn_progress (user_id, lesson_slug, revision, correct, completed_at)
     values ($1, $2, $3, array[$4]::text[], case when $5::text[] <@ array[$4]::text[] then now() end)
     on conflict (user_id, lesson_slug, revision) do update set
       correct = array(select distinct unnest(learn_progress.correct || excluded.correct) order by 1),
       completed_at = coalesce(
         learn_progress.completed_at,
         case when $5::text[] <@ (learn_progress.correct || excluded.correct) then now() end
       ),
       updated_at = now()
     returning correct, completed_at`,
    [userId, slug, revision, exerciseId, [...requiredIds]],
  );
  const row = rows[0];
  return {
    revision,
    correct: row?.correct ?? [exerciseId],
    completedAt: row?.completed_at ? row.completed_at.toISOString() : null,
  };
}

/** Every lesson revision the user has worked on, newest revision first within a lesson. */
export async function getLearnProgress(userId: string): Promise<LearnProgressResponse> {
  const { rows } = await getPool().query<{ lesson_slug: string; revision: number; correct: string[]; completed_at: Date | null }>(
    `select lesson_slug, revision, correct, completed_at from learn_progress
      where user_id = $1 order by lesson_slug, revision desc`,
    [userId],
  );
  return {
    lessons: rows.map((row) => ({
      slug: row.lesson_slug,
      revision: row.revision,
      correct: row.correct,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    })),
  };
}
