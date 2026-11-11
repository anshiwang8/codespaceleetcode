import type { AnswerKind, Difficulty, PuzzleStatus, PuzzleType } from "@/lib/api-types";

export const TYPE_LABELS: Record<PuzzleType, string> = {
  find: "Find",
  trace: "Trace",
  architecture: "Architecture",
  design: "Design",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const STATUS_LABELS: Record<PuzzleStatus, string> = {
  unsolved: "Not started",
  attempted: "Attempted",
  solved: "Solved",
};

const LANGUAGE_NAMES: Record<string, string> = {
  javascript: "JavaScript",
  python: "Python",
  typescript: "TypeScript",
};

/** A repository's language as it's written, such as TypeScript, from the lowercase name the index stores. */
export function languageLabel(language: string): string {
  return LANGUAGE_NAMES[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

/** The required answer in plain words. `setCount` only applies to `set`. */
export function answerKindInWords(kind: AnswerKind, setCount: number | null): string {
  switch (kind) {
    case "symbol":
      return "One symbol: a function, method, class or constant.";
    case "file":
      return "One file.";
    case "location":
      return "A range of lines in one file.";
    case "sequence":
      return "An ordered list of symbols.";
    case "set":
      return setCount === null
        ? "A set of files or symbols, in any order."
        : `Exactly ${setCount} files or symbols, in any order.`;
    case "choice":
      return "One of the listed options.";
  }
}
