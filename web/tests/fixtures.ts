import { getPool } from "@/lib/server/db";

// KEYTOKEN appears only in answer keys and the snapshot data they point at, and SOLUTIONTOKEN only
// in solutions. Prompts and titles never contain either, so a response scan can't false-positive.

export const ROUTER_FILE = "src/router.ts";
export const CONFIG_FILE = "src/KEYTOKEN_config.ts";
export const HANDLE_SYMBOL = "src/router.ts#KEYTOKEN_handle";
export const ALIAS_SYMBOL = "src/router.ts#KEYTOKEN_alias";
export const STEP_SYMBOL = "src/router.ts#KEYTOKEN_step2";
export const DECOY_RUN = "src/decoy.ts#Decoy.run";
export const DECOY_STOP = "src/decoy.ts#Decoy.stop";
export const OTHER_SNAPSHOT_SYMBOL = "lib/other.ts#OtherOnly";

const sha = (char: string) => char.repeat(40);

async function insertRepoAndSnapshot(slug: string, shaChar: string): Promise<number> {
  const pool = getPool();
  const repo = await pool.query<{ id: string }>(
    `insert into repos (slug, url, language, license) values ($1, $2, 'typescript', 'MIT') returning id`,
    [slug, `https://github.com/example/${slug}`],
  );
  const name = `${slug}@${sha(shaChar)}`;
  const snapshot = await pool.query<{ id: string }>(
    `insert into snapshots (repo_id, sha, name, manifest_url) values ($1, $2, $3, $4) returning id`,
    [repo.rows[0]?.id, sha(shaChar), name, `/snapshots/${name}/manifest.json`],
  );
  return Number(snapshot.rows[0]?.id);
}

async function insertFile(snapshotId: number, path: string, content: string): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `insert into files (snapshot_id, path, size, language, content)
     values ($1, $2, $3, 'typescript', $4) returning id`,
    [snapshotId, path, content.length, content],
  );
  return rows[0]?.id ?? "";
}

async function insertSymbol(
  snapshotId: number,
  fileId: string,
  symbolId: string,
  startLine: number,
  endLine: number,
): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `insert into symbols (snapshot_id, file_id, symbol_id, name, kind, start_line, end_line)
     values ($1, $2, $3, $4, 'function', $5, $6) returning id`,
    [snapshotId, fileId, symbolId, symbolId.split("#")[1], startLine, endLine],
  );
  return rows[0]?.id ?? "";
}

async function insertOccurrence(
  symbolPk: string,
  fileId: string,
  line: number,
  col: number,
  endCol: number,
  role: "definition" | "reference",
): Promise<void> {
  await getPool().query(
    `insert into occurrences (symbol_pk, file_id, line, col, end_col, role)
     values ($1, $2, $3, $4, $5, $6)`,
    [symbolPk, fileId, line, col, endCol, role],
  );
}

interface PuzzleFixture {
  slug: string;
  snapshotId: number;
  type: string;
  difficulty: string;
  kind: string;
  key: unknown;
  setCount?: number;
  choices?: unknown;
  tags?: string[];
  published?: boolean;
}

async function insertPuzzle(puzzle: PuzzleFixture): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<{ id: string }>(
    `insert into puzzles (snapshot_id, slug, type, difficulty, title, prompt, answer_kind,
                          answer_json, set_count, choices, hints, tags, verified_by, published)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11::jsonb, $12, $13, $14)
     returning id`,
    [
      puzzle.snapshotId,
      puzzle.slug,
      puzzle.type,
      puzzle.difficulty,
      `Title of ${puzzle.slug}`,
      `Prompt for ${puzzle.slug}. Select an answer.`,
      puzzle.kind,
      JSON.stringify(puzzle.key),
      puzzle.setCount ?? null,
      puzzle.choices === undefined ? null : JSON.stringify(puzzle.choices),
      JSON.stringify(["A hint."]),
      puzzle.tags ?? [],
      ["agent:tester"],
      puzzle.published ?? true,
    ],
  );
  await pool.query("insert into solutions (puzzle_id, body_md) values ($1, $2)", [
    rows[0]?.id,
    `SOLUTIONTOKEN for ${puzzle.slug}`,
  ]);
}

export interface Fixtures {
  snapshotId: number;
  otherSnapshotId: number;
  handlePk: string;
}

export const SEARCH_FILE_CONTENT = [
  "100% done",
  "plain 100 done",
  "under_score",
  "underXscore",
  "back\\slash",
].join("\n");

/** Empties the test database and loads the fixture snapshots and puzzles. */
export async function seedFixtures(): Promise<Fixtures> {
  await getPool().query("truncate repos, auth_users restart identity cascade");

  const snapshotId = await insertRepoAndSnapshot("acme-router", "a");
  const otherSnapshotId = await insertRepoAndSnapshot("other-lib", "b");
  const hiddenSnapshotId = await insertRepoAndSnapshot("hidden-repo", "c");

  const routerFile = await insertFile(
    snapshotId,
    ROUTER_FILE,
    [
      "export function KEYTOKEN_handle() {",
      "  KEYTOKEN_step2();",
      "}",
      "export const KEYTOKEN_alias = KEYTOKEN_handle;",
      "function KEYTOKEN_step2() {}",
    ].join("\n"),
  );
  // Ten lines and a trailing newline: eleven lines, as Monaco counts them.
  const configLines = Array.from({ length: 10 }, (_, i) => `config line ${i + 1}`);
  await insertFile(snapshotId, CONFIG_FILE, `${configLines.join("\n")}\n`);
  const decoyFile = await insertFile(
    snapshotId,
    "src/decoy.ts",
    "first line\r\nsecond CrLfNeedle line\r\nthird line",
  );
  await insertFile(snapshotId, "src/search.txt", SEARCH_FILE_CONTENT);
  await insertFile(
    snapshotId,
    "src/many.txt",
    Array.from({ length: 250 }, (_, i) => `manyneedle ${i + 1}`).join("\n"),
  );
  await insertFile(snapshotId, "src/long.txt", `longneedle${"x".repeat(5000)}`);
  const otherFile = await insertFile(otherSnapshotId, "lib/other.ts", "export function OtherOnly() {}");
  // The same path as in the main snapshot, to catch queries that forget the snapshot.
  await insertFile(otherSnapshotId, ROUTER_FILE, "export const onlyInOtherSnapshot = 1;");

  const handlePk = await insertSymbol(snapshotId, routerFile, HANDLE_SYMBOL, 1, 3);
  await insertSymbol(snapshotId, routerFile, ALIAS_SYMBOL, 4, 4);
  const stepPk = await insertSymbol(snapshotId, routerFile, STEP_SYMBOL, 5, 5);
  const runPk = await insertSymbol(snapshotId, decoyFile, DECOY_RUN, 1, 1);
  const stopPk = await insertSymbol(snapshotId, decoyFile, DECOY_STOP, 1, 1);
  await insertSymbol(otherSnapshotId, otherFile, OTHER_SNAPSHOT_SYMBOL, 1, 1);

  await insertOccurrence(handlePk, routerFile, 1, 17, 32, "definition");
  await insertOccurrence(handlePk, routerFile, 4, 31, 46, "reference");
  await insertOccurrence(stepPk, routerFile, 5, 10, 24, "definition");
  await insertOccurrence(stepPk, routerFile, 2, 3, 17, "reference");
  // One occurrence inside another, so a position can sit on both.
  await insertOccurrence(runPk, decoyFile, 1, 1, 11, "reference");
  await insertOccurrence(stopPk, decoyFile, 1, 3, 6, "reference");

  const symbolKey = {
    kind: "symbol",
    id: HANDLE_SYMBOL,
    accept: [ALIAS_SYMBOL],
    accept_reasons: ["A re-export of the same function"],
  };
  await insertPuzzle({
    slug: "fx-symbol",
    snapshotId,
    type: "find",
    difficulty: "easy",
    kind: "symbol",
    key: symbolKey,
    tags: ["routing", "http"],
  });
  await insertPuzzle({
    slug: "fx-file",
    snapshotId,
    type: "find",
    difficulty: "easy",
    kind: "file",
    key: { kind: "file", path: CONFIG_FILE, accept: [], accept_reasons: [] },
    tags: ["config"],
  });
  await insertPuzzle({
    slug: "fx-location",
    snapshotId,
    type: "find",
    difficulty: "medium",
    kind: "location",
    key: { kind: "location", path: CONFIG_FILE, anchor: [3, 4], window: [2, 8] },
  });
  await insertPuzzle({
    slug: "fx-sequence",
    snapshotId,
    type: "trace",
    difficulty: "medium",
    kind: "sequence",
    key: { kind: "sequence", ids: [HANDLE_SYMBOL, STEP_SYMBOL], accept_sequences: [] },
  });
  await insertPuzzle({
    slug: "fx-set",
    snapshotId,
    type: "architecture",
    difficulty: "hard",
    kind: "set",
    key: { kind: "set", ids: [CONFIG_FILE, HANDLE_SYMBOL] },
    setCount: 2,
  });
  await insertPuzzle({
    slug: "fx-choice",
    snapshotId,
    type: "architecture",
    difficulty: "easy",
    kind: "choice",
    key: { kind: "choice", option: "opt-b" },
    // The stray flag must never come back out. The migration forbids it, but seeds can be wrong.
    choices: [
      { id: "opt-a", label: "Option A" },
      { id: "opt-b", label: "Option B", correct: true },
      { id: "opt-c", label: "Option C" },
    ],
  });
  await insertPuzzle({
    slug: "fx-other",
    snapshotId: otherSnapshotId,
    type: "find",
    difficulty: "hard",
    kind: "symbol",
    key: { kind: "symbol", id: OTHER_SNAPSHOT_SYMBOL, accept: [], accept_reasons: [] },
    tags: ["other"],
  });
  await insertPuzzle({
    slug: "fx-hidden",
    snapshotId,
    type: "find",
    difficulty: "easy",
    kind: "symbol",
    key: symbolKey,
    tags: ["hidden-tag"],
    published: false,
  });
  await insertPuzzle({
    slug: "fx-hidden-repo",
    snapshotId: hiddenSnapshotId,
    type: "find",
    difficulty: "easy",
    kind: "symbol",
    key: symbolKey,
    published: false,
  });

  return { snapshotId, otherSnapshotId, handlePk };
}

export const PUBLISHED_PUZZLE_COUNT = 7;
