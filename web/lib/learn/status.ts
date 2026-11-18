import type { LessonProgress } from "@/lib/learn/types";

export type LessonStatus = "complete" | "updated" | "started" | "none";

/**
 * A lesson's status for the current revision. "updated" means the learner completed an earlier
 * revision but not this one: the older completion is kept, and the lesson asks to be reviewed.
 */
export function statusOf(entries: readonly LessonProgress[] | undefined, revision: number): LessonStatus {
  const current = entries?.find((entry) => entry.revision === revision);
  if (current?.completedAt) return "complete";
  if (current && current.correct.length > 0) return "started";
  if (entries?.some((entry) => entry.completedAt && entry.revision < revision)) return "updated";
  return "none";
}
