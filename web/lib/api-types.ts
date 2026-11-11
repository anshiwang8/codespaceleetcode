// Shapes shared by the API routes and the UI. Nothing here may ever carry an answer key.
// See spec.md section 9.

import type { AchievementCategory } from "@/lib/achievements";
import type { LeaderboardPeriod, PeriodKind } from "@/lib/periods";
import type { ProfileLinks } from "@/lib/profile-fields";
import type { ThemePreference } from "@/lib/themes/runtime";

export type { LeaderboardPeriod, PeriodKind, ProfileLinks, ThemePreference };

/** In the order the site lists them. */
export const PUZZLE_TYPES = ["find", "trace", "architecture", "design"] as const;
export type PuzzleType = (typeof PUZZLE_TYPES)[number];
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
  /** How many hint levels this puzzle has (0 to 3). The text arrives only as each is revealed. */
  hintCount: number;
  /** The hints this user has revealed, in order. Empty when signed out. */
  revealedHints: string[];
  /** The open challenge periods that feature this puzzle, for linking to /challenges. */
  featuredIn: PeriodKind[];
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
  /** Points this submission earned, bonuses included. 0 when it earned none. */
  pointsAwarded: number;
  /** Achievements this submission unlocked, for the toast. */
  achievements: AchievementUnlock[];
  /** Challenge periods this submission completed. */
  challenges: { kind: PeriodKind; bonus: number }[];
}

/** POST /api/puzzles/:slug/hints */
export interface HintRevealResponse {
  hintCount: number;
  revealedHints: string[];
}

export interface AchievementUnlock {
  id: string;
  title: string;
  description: string;
}

export interface AchievementStatus extends AchievementUnlock {
  category: AchievementCategory;
  icon: string;
  /** The number to reach. "All" thresholds are resolved to a count here. */
  threshold: number;
  /** How far the user is, capped at the threshold. */
  progress: number;
  /** When the activity that earned it happened, or null while locked. */
  unlockedAt: string | null;
}

/** GET /api/me/achievements */
export interface AchievementsResponse {
  achievements: AchievementStatus[];
}

export interface ChallengePuzzle {
  slug: string;
  title: string;
  type: PuzzleType;
  difficulty: Difficulty;
  repoSlug: string;
}

export interface ChallengeCard {
  kind: PeriodKind;
  /** YYYY-MM-DD, the UTC date the period starts. */
  periodStart: string;
  /** "Wednesday, November 11, 2026", "Week of November 9, 2026", "November 2026". */
  label: string;
  /** ISO timestamps: 00:00 UTC at the start, and 00:00 UTC when the next period begins. */
  startsAt: string;
  endsAt: string;
  /** Null when the puzzle has since been withdrawn. */
  puzzle: ChallengePuzzle | null;
  /** Bonus points for completing it while the period is open. */
  bonus: number;
  /** Completed during the period. Always false when signed out. */
  completed: boolean;
  completedAt: string | null;
  /** The user's status on the puzzle itself, at any time. */
  status: PuzzleStatus;
}

export interface ChallengeStreak {
  /** Consecutive UTC dates with the daily challenge completed, ending today or yesterday. */
  current: number;
  longest: number;
  completedToday: boolean;
}

/** GET /api/challenges */
export interface ChallengesResponse {
  /** The server's clock when this was built, for counting down without trusting the browser. */
  now: string;
  current: ChallengeCard[];
  /** Null when signed out. */
  streak: ChallengeStreak | null;
  /** Periods completed, by kind. Null when signed out. */
  completedCounts: Record<PeriodKind, number> | null;
}

/** GET /api/challenges/archive?kind=&before= */
export interface ChallengeArchiveResponse {
  kind: PeriodKind;
  items: ChallengeCard[];
  /** Pass as `before` for the next page, or null at the end. */
  nextBefore: string | null;
}

export interface LeaderboardRow {
  rank: number;
  publicName: string;
  points: number;
  /** Distinct puzzles first solved in the period. */
  solved: number;
  /** When the user reached this total: the earlier one ranks higher on a tie. */
  reachedAt: string;
  isYou: boolean;
}

export interface LeaderboardYou {
  participating: boolean;
  publicName: string | null;
  /** Null when not participating or with no points in the period. */
  rank: number | null;
  points: number;
  solved: number;
}

/** GET /api/leaderboard?period=&page= */
export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  /** Null for all time. */
  range: { startsAt: string; endsAt: string } | null;
  now: string;
  page: number;
  pageSize: number;
  /** Ranked participants with points in the period. */
  totalEntries: number;
  rows: LeaderboardRow[];
  /** Null when signed out. */
  you: LeaderboardYou | null;
}

/** GET, PUT and DELETE /api/me/leaderboard */
export interface LeaderboardParticipation {
  participating: boolean;
  publicName: string | null;
  joinedAt: string | null;
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

/** Appearance saved to an account. `preference` is null until one is chosen. */
export interface AppearanceSettings {
  preference: ThemePreference | null;
  favorites: string[];
}

/** GET /api/me */
export interface MeResponse {
  user: {
    login: string;
    via: "github" | "dev";
    /** The user-chosen display name, or null. */
    displayName: string | null;
    /** Changes with every upload; null shows the default silhouette. */
    avatarVersion: string | null;
    /** True until a contact email is verified. The address itself is never in this response. */
    needsEmail: boolean;
    appearance: AppearanceSettings;
  } | null;
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
  /** The display name the user chose in Settings, or null. Never taken from GitHub. */
  displayName: string | null;
  pronouns: string | null;
  bio: string | null;
  links: ProfileLinks;
  /** Null shows the default silhouette. */
  avatarVersion: string | null;
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

/** Optional personal details. Every one may be null. */
export interface ProfileDetails {
  displayName: string | null;
  pronouns: string | null;
  bio: string | null;
  /** YYYY-MM-DD, a calendar date with no time zone. Only in the settings response. */
  birthday: string | null;
}

/** The contact email and any change waiting for verification. Only in the settings response. */
export interface EmailStatus {
  /** The verified address, or null if none is verified yet. */
  address: string | null;
  verifiedAt: string | null;
  pending: { address: string; purpose: "setup" | "change"; expiresAt: string; expired: boolean } | null;
  /** False when this server can't send email; nothing can be verified then. */
  deliveryAvailable: boolean;
  /** True in local development, where messages are saved to a folder instead of sent. */
  localOutbox: boolean;
  /** Whether the session is recent enough to change a verified address. */
  recentSignIn: boolean;
}

/** GET /api/me/settings */
export interface SettingsResponse {
  login: string;
  provider: "github" | "dev";
  details: ProfileDetails;
  links: ProfileLinks;
  appearance: AppearanceSettings;
  avatarVersion: string | null;
  email: EmailStatus;
}

export interface ApiError {
  error: string;
}
