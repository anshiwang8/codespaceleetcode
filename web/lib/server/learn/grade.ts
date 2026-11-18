import "server-only";
import { z } from "zod";
import { COURSE } from "@/lib/learn/course.generated";
import type { LearnAnswer, PublicExercise, PublicLesson } from "@/lib/learn/types";
import { codeLines } from "@/lib/learn/code";
import { KEYS } from "@/lib/server/learn/keys.generated";
import type { ExerciseKey } from "@/lib/server/learn/types";

// Grading for the Learn path. Every answer is a set of stable ids (a choice, a line number, an
// ordered list of steps), compared exactly against content/lessons/ keys: no fuzzy matching and no
// free text, as for puzzles (CLAUDE.md rules 2 and 3). A wrong answer gets the author's feedback for
// that choice, or a general nudge; never the answer, and never which part of a sequence was wrong.

const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(40);

export const answerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("choice"), choiceId: id }),
  z.strictObject({ kind: z.literal("line"), line: z.number().int().min(1).max(500) }),
  z.strictObject({ kind: z.literal("sequence"), steps: z.array(id).min(1).max(10) }),
]);

export const targetSchema = z.strictObject({
  revision: z.number().int().min(1).max(10_000),
  exerciseId: id,
});

export type Target = { lesson: PublicLesson; exercise: PublicExercise; key: ExerciseKey };

export type FindResult =
  | { state: "ok"; target: Target }
  | { state: "not_found" }
  /** The page was made from an older revision; reloading shows the current one. */
  | { state: "stale"; revision: number };

export function findExercise(slug: string, revision: number, exerciseId: string): FindResult {
  const lesson = Object.hasOwn(COURSE.lessons, slug) ? COURSE.lessons[slug] : undefined;
  const keys = Object.hasOwn(KEYS, slug) ? KEYS[slug] : undefined;
  if (!lesson || !keys) return { state: "not_found" };
  if (revision !== lesson.revision) return { state: "stale", revision: lesson.revision };
  const exercise = lesson.exercises.find((item) => item.id === exerciseId);
  const key = Object.hasOwn(keys.exercises, exerciseId) ? keys.exercises[exerciseId] : undefined;
  if (!exercise || !key) return { state: "not_found" };
  return { state: "ok", target: { lesson, exercise, key } };
}

export function findLesson(slug: string): PublicLesson | null {
  return Object.hasOwn(COURSE.lessons, slug) ? (COURSE.lessons[slug] ?? null) : null;
}

const NUDGE: Record<PublicExercise["kind"], string> = {
  choice: "Not quite. Trace it again from the start, one line at a time.",
  line: "Not that line. Reread the question: which line does exactly what it asks?",
  sequence: "Not quite. Check where the trace starts and stops, and which branch the input takes.",
};

export type GradeResult =
  | { state: "invalid"; error: string }
  | { state: "graded"; correct: boolean; feedback: string | null; explanation: string | null };

/** Checks the answer is well-formed for this exercise, then compares it with the key. */
export function grade({ lesson, exercise, key }: Target, answer: LearnAnswer): GradeResult {
  if (answer.kind !== exercise.kind) return { state: "invalid", error: `This question takes a ${exercise.kind} answer` };
  let correct: boolean;
  if (answer.kind === "choice") {
    if (!exercise.choices?.some((choice) => choice.id === answer.choiceId)) return { state: "invalid", error: "Unknown choice" };
    correct = answer.choiceId === key.answer;
  } else if (answer.kind === "line") {
    const block = lesson.codeBlocks.find((item) => item.id === exercise.block);
    if (!block || answer.line > codeLines(block.source).length) return { state: "invalid", error: "That line isn't in the code" };
    correct = answer.line === key.answer;
  } else {
    const candidates = new Set((exercise.candidates ?? []).map((candidate) => candidate.id));
    if (answer.steps.some((step) => !candidates.has(step))) return { state: "invalid", error: "Unknown step" };
    if (new Set(answer.steps).size !== answer.steps.length) return { state: "invalid", error: "Each step can be used once" };
    const expected = Array.isArray(key.answer) ? key.answer : [];
    correct = answer.steps.length === expected.length && answer.steps.every((step, index) => step === expected[index]);
  }
  if (correct) return { state: "graded", correct: true, feedback: null, explanation: key.explanation };
  const specific = answer.kind === "choice" && Object.hasOwn(key.feedback, answer.choiceId) ? key.feedback[answer.choiceId] : undefined;
  return { state: "graded", correct: false, feedback: specific ?? NUDGE[exercise.kind], explanation: null };
}

export function revealedAnswer(target: Target): LearnAnswer {
  const { key } = target;
  if (key.kind === "choice") return { kind: "choice", choiceId: String(key.answer) };
  if (key.kind === "line") return { kind: "line", line: Number(key.answer) };
  return { kind: "sequence", steps: Array.isArray(key.answer) ? key.answer : [] };
}

export function rubricFor(slug: string): string | null {
  const keys = Object.hasOwn(KEYS, slug) ? KEYS[slug] : undefined;
  return keys?.rubric ?? null;
}
