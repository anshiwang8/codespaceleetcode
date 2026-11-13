// The Learn path's public shapes. course.generated.ts holds data of these types, written by
// `uv run python -m ingest learn` from content/lessons/. Nothing here is a key: answers,
// explanations, hints and per-choice feedback live in web/lib/server/learn/keys.generated.ts.

export type LessonKind = "lesson" | "checkpoint" | "capstone";
export type ExerciseKind = "choice" | "line" | "sequence";
export type ExerciseRole = "practice" | "required";

export interface LearnOption {
  id: string;
  /** One line: `code` spans and **bold** only. */
  label: string;
}

export interface CodeBlock {
  id: string;
  file?: string;
  lang: "js" | "ts" | "py" | "text";
  source: string;
}

export interface PublicExercise {
  id: string;
  role: ExerciseRole;
  label?: string;
  kind: ExerciseKind;
  /** Markdown. */
  prompt: string;
  choices?: LearnOption[];
  /** kind "line": the code block whose lines are selectable. */
  block?: string;
  /** kind "sequence": the steps to pick from. */
  candidates?: LearnOption[];
  /** The lesson to revisit after a miss. */
  review?: string;
  hintCount: number;
}

export interface PublicLesson {
  slug: string;
  /** L01 to L24, or C1 to C4. */
  code: string;
  kind: LessonKind;
  revision: number;
  title: string;
  badge?: string;
  minutes: number;
  summary: string;
  objective: string;
  prerequisites: string[];
  prerequisiteNote?: string;
  topics: string[];
  teach?: string;
  scenario?: string;
  codeBlocks: CodeBlock[];
  example?: { prompt: string; blocks?: string[]; explanation: string };
  mistake?: string;
  next?: string;
  transfer?: string;
  after?: string;
  practice: string[];
  references: string[];
  exercises: PublicExercise[];
  reflection?: { prompt: string };
  groupId: string;
  /** Null for a group's checkpoint. */
  moduleId: string | null;
  /** Index in the course order. */
  position: number;
  /** The exercises that decide completion. */
  requiredIds: string[];
}

export interface LearnModule {
  id: string;
  number: number;
  title: string;
  summary: string;
  lessons: string[];
}

export interface LearnGroup {
  id: string;
  number: number;
  title: string;
  summary: string;
  checkpoint: string | null;
  modules: LearnModule[];
}

export interface LearnReference {
  title: string;
  source: string;
  url: string;
}

export interface LearnCourse {
  title: string;
  summary: string;
  groups: LearnGroup[];
  /** Every lesson, checkpoint and capstone slug in course order. */
  order: string[];
  lessons: Record<string, PublicLesson>;
  references: Record<string, LearnReference>;
}

/** What a learner sends to be graded. */
export type LearnAnswer =
  | { kind: "choice"; choiceId: string }
  | { kind: "line"; line: number }
  | { kind: "sequence"; steps: string[] };

/** The revealed correct answer, in the same terms. */
export type LearnRevealedAnswer = LearnAnswer;

/** One lesson's progress, as the browser shows it. */
export interface LessonProgress {
  /** The revision the progress below belongs to. */
  revision: number;
  /** Required exercises answered correctly at that revision. */
  correct: string[];
  /** When every required exercise was correct, for that revision. */
  completedAt: string | null;
}

export interface CheckResponse {
  correct: boolean;
  /** After a wrong answer: what to reconsider. Never the answer. */
  feedback: string | null;
  /** After a correct answer only. */
  explanation: string | null;
  /** The lesson's progress after this check. Null when nobody is signed in; the browser keeps it. */
  progress: LessonProgress | null;
}

export interface HintResponse {
  level: number;
  hint: string;
  hintCount: number;
}

export interface RevealResponse {
  answer: LearnRevealedAnswer;
  explanation: string;
}

export interface RubricResponse {
  rubric: string;
}

/** GET /api/me/learn: the signed-in user's own progress, every revision they've worked on. */
export interface LearnProgressResponse {
  lessons: { slug: string; revision: number; correct: string[]; completedAt: string | null }[];
}
