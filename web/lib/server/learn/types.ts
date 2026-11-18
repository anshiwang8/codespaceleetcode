import "server-only";
import type { ExerciseKind, ExerciseRole } from "@/lib/learn/types";

/** One exercise's private record. Only grade.ts reads it. */
export interface ExerciseKey {
  kind: ExerciseKind;
  role: ExerciseRole;
  /** choice: a choice id. line: a 1-based line number. sequence: candidate ids in order. */
  answer: string | number | string[];
  /** Shown after a correct answer or a reveal. */
  explanation: string;
  /** Revealed one at a time, on request. */
  hints: string[];
  /** What to say after a particular wrong choice, by choice id. */
  feedback: Record<string, string>;
}

export interface LessonKeys {
  revision: number;
  exercises: Record<string, ExerciseKey>;
  /** The capstone's reflection rubric, shown when the learner asks. */
  rubric?: string;
}
