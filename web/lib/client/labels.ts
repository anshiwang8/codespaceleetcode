import type { AnswerKind, Difficulty, PuzzleStatus, PuzzleType } from "@/lib/api-types";

export const TYPE_LABELS: Record<PuzzleType, string> = {
  find: "Find",
  trace: "Trace",
  architecture: "Architecture",
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
  given_up: "Gave up",
};

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
