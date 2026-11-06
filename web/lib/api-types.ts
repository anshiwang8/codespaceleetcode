// Shapes shared by the API routes and the UI. Nothing here may ever carry an answer key.
// See spec.md section 9.

export type PuzzleType = "find" | "trace" | "architecture";
export type Difficulty = "easy" | "medium" | "hard";
export type AnswerKind = "symbol" | "file" | "location" | "sequence" | "set" | "choice";
export type PuzzleStatus = "unsolved" | "attempted" | "solved";

export interface PuzzleSummary {
  slug: string;
  type: PuzzleType;
  difficulty: Difficulty;
  title: string;
  repoSlug: string;
  language: string;
  tags: string[];
  status: PuzzleStatus;
}

export interface PuzzleListResponse {
  puzzles: PuzzleSummary[];
  /** Every value that exists, for building the filter controls. */
  repos: string[];
  tags: string[];
}

export interface SnapshotInfo {
  id: number;
  /** `<slug>@<sha>`, the folder under `/snapshots/`. */
  name: string;
  sha: string;
  repoSlug: string;
  repoUrl: string;
  license: string;
  language: string;
  manifestUrl: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface PuzzleDetail extends PuzzleSummary {
  prompt: string;
  answerKind: AnswerKind;
  /** The required count for `set` puzzles, otherwise null. */
  setCount: number | null;
  /** The options for `choice` puzzles, otherwise null. */
  choices: ChoiceOption[] | null;
  hints: string[];
  /** Who did the blind second solve. An `agent:` prefix means it wasn't a person. */
  verifiedBy: string[];
  attempts: number;
  snapshot: SnapshotInfo;
}

/** The body of POST /api/puzzles/:slug/submit. Every value comes from a click, never typing. */
export type Submission = (
  | { kind: "symbol"; id: string }
  | { kind: "file"; path: string }
  | { kind: "location"; id: string } // path:Lstart-Lend
  | { kind: "sequence"; ids: string[] }
  | { kind: "set"; ids: string[] }
  | { kind: "choice"; option: string }
) & { timeOnPuzzleMs?: number };

export interface SubmitResponse {
  correct: boolean;
  attempts: number;
}

export interface SolutionResponse {
  bodyMd: string;
}

export interface ManifestFile {
  path: string;
  size: number;
  language: string;
}

/** `manifest.json`, served from `/snapshots/<name>/manifest.json`. */
export interface Manifest {
  slug: string;
  url: string;
  sha: string;
  language: string;
  license: string;
  indexer: { name: string; version: string };
  files: ManifestFile[];
}

export interface SymbolInfo {
  symbolId: string;
  name: string;
  kind: string;
  file: string;
  startLine: number;
  endLine: number;
}

export interface SourcePosition {
  file: string;
  line: number;
  col: number;
  endCol: number;
}

/** The most references one response carries. */
export const REFERENCE_CAP = 500;

/** GET /api/snapshots/:id/symbols?file=&line=&col= */
export interface SymbolAtPositionResponse {
  symbol: SymbolInfo | null;
  definition: SourcePosition | null;
  references: SourcePosition[];
  /** True when the symbol has more than REFERENCE_CAP references and only the first are listed. */
  referencesTruncated: boolean;
}

/** GET /api/snapshots/:id/symbols/outline?file= */
export interface OutlineResponse {
  symbols: SymbolInfo[];
}

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

/** GET /api/snapshots/:id/search?q= */
export interface SearchResponse {
  matches: SearchMatch[];
  /** True when the 200-match cap cut results off. */
  truncated: boolean;
}

/** GET /api/me */
export interface MeResponse {
  user: { login: string; via: "github" | "dev" } | null;
  /** True when this server has a GitHub OAuth app configured. */
  githubAuth: boolean;
  /** True when the localhost-only dev login is available. */
  devAuth: boolean;
}

/** GET /api/me/stats */
export interface StatsResponse {
  solved: number;
  total: number;
  byType: Record<PuzzleType, { solved: number; total: number }>;
  byDifficulty: Record<Difficulty, { solved: number; total: number }>;
}

/** Solved, attempted-but-unsolved, and published counts for one slice of the catalog. */
export interface ProgressCount {
  solved: number;
  /** Attempted and not solved yet. */
  attempted: number;
  /** Published puzzles in this slice. */
  total: number;
}

export interface RepoProgress extends ProgressCount {
  repo: string;
  language: string;
}

export interface TopicProgress extends ProgressCount {
  topic: string;
}

/**
 * The signed-in user's own account, as the profile shows it. It never carries the stored email,
 * which is a placeholder, or any token or raw auth record.
 */
export interface ProfileIdentity {
  login: string;
  /** The GitHub display name, when it's set and differs from the login. */
  displayName: string | null;
  /** "github" for a linked GitHub account, "dev" for the localhost-only dev login. */
  provider: "github" | "dev";
  /** When the account was created, as an ISO 8601 timestamp. */
  memberSince: string;
  /** The account's GitHub page, for GitHub accounts only. */
  githubUrl: string | null;
}

export interface ProfileProgress extends ProgressCount {
  /** solved / total as a whole percent, rounded down so it reads 100 only when everything is solved. */
  completionPercent: number;
  /** Every graded submission to a published puzzle, repeats included. Not a count of puzzles. */
  submissions: number;
  byType: Record<PuzzleType, ProgressCount>;
  byDifficulty: Record<Difficulty, ProgressCount>;
  byRepo: RepoProgress[];
  /** A puzzle has one to three topics, so these overlap and don't add up to `total`. */
  byTopic: TopicProgress[];
}

/** A puzzle the user has attempted and not solved yet. */
export interface UnfinishedPuzzle {
  slug: string;
  title: string;
  type: PuzzleType;
  difficulty: Difficulty;
  repoSlug: string;
  attempts: number;
  /** ISO 8601. Null only if the submissions behind the attempts are gone. */
  lastSubmittedAt: string | null;
}

/**
 * One UTC calendar date of graded submissions. `available` is false for a date after today or
 * before the account's history starts: those weren't missed practice, so they show as
 * unavailable rather than as zero.
 */
export interface ActivityDay {
  /** YYYY-MM-DD. */
  date: string;
  submissions: number;
  /** Submissions that were graded right. */
  passed: number;
  available: boolean;
}

/** "rolling" is the 365 UTC dates ending today; a four-digit year is that calendar year. */
export type ActivityPeriodKey = "rolling" | `${number}`;

export interface ProfileActivity {
  /** The zone that decides which day a submission falls on. Always UTC. */
  timeZone: "UTC";
  period: ActivityPeriodKey;
  /** "Last 365 days", or the year. */
  label: string;
  /** First and last dates of the period, inclusive. A calendar year has 365 or 366 of them. */
  start: string;
  end: string;
  /** Today's UTC date on the server, the one boundary every activity figure uses. */
  today: string;
  /** Every date of the period, oldest first. */
  days: ActivityDay[];
  /** Dates in the period with at least one submission. */
  activeDays: number;
  submissions: number;
  /** Calendar years that can be shown: from the account's first year through this one. */
  years: number[];
}

/**
 * Practice streaks over the account's whole history, never just the period shown. A streak day
 * is a UTC date with at least one graded submission to a published puzzle.
 */
export interface PracticeStreaks {
  /** The run ending today, or yesterday if today has no submissions yet; otherwise 0. */
  current: number;
  /** The longest run of consecutive active dates ever recorded. */
  longest: number;
  /** Graded submissions today (UTC). */
  submissionsToday: number;
  today: string;
}

/**
 * Distinct puzzles first solved, over the same period as the activity calendar. Each solved
 * puzzle counts once, on the date of its first correct submission.
 */
export interface SolveTimeline {
  start: string;
  end: string;
  /** Puzzles first solved before `start`. */
  baseline: number;
  /** Dates in the period with first solves, oldest first. */
  solves: { date: string; count: number }[];
}

/** GET /api/me/activity?period= */
export interface ActivityResponse {
  activity: ProfileActivity;
  timeline: SolveTimeline;
}

/** History filters. Each narrows the whole history on the server, not just the loaded page. */
export interface HistoryFilters {
  type?: PuzzleType;
  difficulty?: Difficulty;
  repo?: string;
  /** "passed" or "failed". */
  outcome?: "passed" | "failed";
  /** One UTC date, YYYY-MM-DD. */
  date?: string;
}

/** One graded submission, without the answer that was submitted. */
export interface HistoryEntry {
  /** Opaque; pass the last one as `before` to get the next page. */
  id: string;
  slug: string;
  title: string;
  repoSlug: string;
  type: PuzzleType;
  difficulty: Difficulty;
  passed: boolean;
  /** ISO 8601. */
  submittedAt: string;
}

/** GET /api/me/history?before=&limit= */
export interface HistoryPage {
  entries: HistoryEntry[];
  /** Null on the last page. */
  nextCursor: string | null;
}

/** GET /api/me/profile */
export interface ProfileResponse {
  identity: ProfileIdentity;
  progress: ProfileProgress;
  unfinished: UnfinishedPuzzle[];
  activity: ProfileActivity;
  streaks: PracticeStreaks;
  timeline: SolveTimeline;
  history: HistoryPage;
}

export interface ApiError {
  error: string;
}
