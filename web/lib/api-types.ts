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

export interface ApiError {
  error: string;
}
