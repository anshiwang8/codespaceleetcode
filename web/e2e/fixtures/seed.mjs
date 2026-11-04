// Loads the fixture snapshot and its puzzles into a database. The rows are written by hand here
// because the real seed command isn't what these tests are about; they test the UI.
//
// Positions are worked out from the fixture files, so a token that isn't on its stated line throws
// instead of quietly producing an occurrence that points at nothing.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const SNAPSHOT_DIR = path.join(HERE, "snapshots");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const NAME = `acme-tiny@${SHA}`;

/** A sentinel that appears in an answer key, so a scan for it can't false-positive on anything else. */
export const KEY_SENTINEL = "KEYTOKEN";
export const SOLUTION_SENTINEL = "SOLUTIONTOKEN";

// [symbol ID, kind, file, start, end, definition line and token, ...references]
const SYMBOLS = [
  {
    id: "src/index.ts#start",
    kind: "function",
    file: "src/index.ts",
    lines: [5, 9],
    definition: [5, "start"],
    references: [],
  },
  {
    id: "src/router.ts#Router",
    kind: "class",
    file: "src/router.ts",
    lines: [3, 15],
    definition: [3, "Router"],
    references: [
      ["src/index.ts", 3, "Router"],
      ["src/index.ts", 6, "Router"],
    ],
  },
  {
    id: "src/router.ts#Router.handle",
    kind: "method",
    file: "src/router.ts",
    lines: [4, 9],
    definition: [4, "handle"],
    references: [["src/index.ts", 8, "handle"]],
  },
  {
    id: "src/router.ts#Router.match",
    kind: "method",
    file: "src/router.ts",
    lines: [11, 14],
    definition: [11, "match"],
    references: [["src/router.ts", 5, "match"]],
  },
  {
    id: "src/views.ts#renderNotFound",
    kind: "function",
    file: "src/views.ts",
    lines: [1, 3],
    definition: [1, "renderNotFound"],
    references: [
      ["src/router.ts", 1, "renderNotFound"],
      ["src/router.ts", 8, "renderNotFound"],
    ],
  },
  {
    id: "src/views.ts#renderHome",
    kind: "function",
    file: "src/views.ts",
    lines: [5, 7],
    definition: [5, "renderHome"],
    references: [],
  },
  {
    id: "src/config.ts#DEFAULT_PORT",
    kind: "constant",
    file: "src/config.ts",
    lines: [1, 1],
    definition: [1, "DEFAULT_PORT"],
    references: [
      ["src/index.ts", 1, "DEFAULT_PORT"],
      ["src/index.ts", 8, "DEFAULT_PORT"],
    ],
  },
  {
    id: "src/config.ts#LIMITS",
    kind: "constant",
    file: "src/config.ts",
    lines: [3, 8],
    definition: [3, "LIMITS"],
    references: [],
  },
  {
    id: "src/logging/logger.ts#logRequest",
    kind: "function",
    file: "src/logging/logger.ts",
    lines: [1, 3],
    definition: [1, "logRequest"],
    references: [
      ["src/index.ts", 2, "logRequest"],
      ["src/index.ts", 7, "logRequest"],
    ],
  },
  {
    id: "src/windows.ts#crlfHelper",
    kind: "function",
    file: "src/windows.ts",
    lines: [1, 3],
    definition: [1, "crlfHelper"],
    references: [["src/windows.ts", 5, "crlfHelper"]],
  },
  {
    id: `src/vault.ts#${KEY_SENTINEL}_unlock`,
    kind: "function",
    file: "src/vault.ts",
    lines: [1, 3],
    definition: [1, `${KEY_SENTINEL}_unlock`],
    references: [],
  },
];

const AGENT_ONLY = ["agent:e2e-blind-solver"];

function puzzle(fields) {
  return {
    difficulty: "easy",
    tags: [],
    hints: ["Start from the entry point.", "Follow the call into the router."],
    verifiedBy: AGENT_ONLY,
    choices: null,
    setCount: null,
    ...fields,
  };
}

/** Every answer kind appears, across all three types. */
export const PUZZLES = [
  puzzle({
    slug: "e2e-find-symbol",
    type: "find",
    title: "Where a path is matched",
    prompt: "In `src/router.ts`, select the method that decides whether a path matches. Select a method.",
    kind: "symbol",
    key: { kind: "symbol", id: "src/router.ts#Router.match", accept: [], accept_reasons: [] },
    tags: ["routing"],
  }),
  puzzle({
    slug: "e2e-find-file",
    type: "find",
    title: "Where limits live",
    prompt: "Select the file that defines the request limits. Select a file.",
    kind: "file",
    key: { kind: "file", path: "src/config.ts", accept: [], accept_reasons: [] },
    tags: ["configuration"],
    verifiedBy: ["anshi"],
  }),
  puzzle({
    slug: "e2e-find-location",
    type: "find",
    difficulty: "medium",
    title: "The byte limits",
    prompt: "In `src/config.ts`, select the lines that set the two byte limits. Select the lines.",
    kind: "location",
    key: { kind: "location", path: "src/config.ts", anchor: [4, 5], window: [3, 8] },
    tags: ["configuration"],
  }),
  puzzle({
    slug: "e2e-trace-sequence",
    type: "trace",
    difficulty: "medium",
    title: "From start to match",
    prompt:
      "Starting at `start`, list the project functions called on the way to `match`, in order, " +
      "including both ends. Direct calls only, skipping logging.",
    kind: "sequence",
    key: {
      kind: "sequence",
      ids: ["src/index.ts#start", "src/router.ts#Router.handle", "src/router.ts#Router.match"],
      accept_sequences: [],
    },
    tags: ["routing"],
  }),
  puzzle({
    slug: "e2e-arch-set",
    type: "architecture",
    difficulty: "hard",
    title: "What the router needs",
    prompt: "Select the file that renders the 404 page, and the symbol that calls into it.",
    kind: "set",
    key: { kind: "set", ids: ["src/views.ts", "src/router.ts#Router.handle"] },
    setCount: 2,
    tags: ["code-structure"],
  }),
  puzzle({
    slug: "e2e-arch-choice",
    type: "architecture",
    title: "Who owns the port",
    prompt: "Which module owns the default port?",
    kind: "choice",
    key: { kind: "choice", option: "config" },
    choices: [
      { id: "router", label: "The router module" },
      { id: "config", label: "The config module" },
      { id: "views", label: "The views module" },
    ],
    tags: ["code-structure"],
  }),
  puzzle({
    slug: "e2e-sentinel",
    type: "find",
    difficulty: "hard",
    title: "A puzzle whose answer nobody should see",
    prompt: "Used to prove the key stays on the server. Select a function.",
    kind: "symbol",
    key: { kind: "symbol", id: `src/vault.ts#${KEY_SENTINEL}_unlock`, accept: [], accept_reasons: [] },
    tags: ["auth-and-security"],
  }),
];

function solutionFor(puzzle) {
  return [
    `## Solution for ${puzzle.title}`,
    "",
    `Written solution with the marker ${SOLUTION_SENTINEL}.`,
    "",
    "<script>window.__solutionHtmlRan = true</script>",
    "",
    "- Start at `src/index.ts`",
    "- Jump to the definition",
  ].join("\n");
}

function walk(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full, relative) : [{ relative, full }];
  });
}

function columnOf(content, file, line, token) {
  const text = content.split(/\r\n|\r|\n/)[line - 1];
  const index = text?.indexOf(token) ?? -1;
  if (index === -1) throw new Error(`Fixture: ${token} is not on ${file}:${line}`);
  return index + 1;
}

/** Replaces everything in the database with the fixture. */
export async function seedFixture(client) {
  const manifest = JSON.parse(
    readFileSync(path.join(SNAPSHOT_DIR, NAME, "manifest.json"), "utf8"),
  );
  await client.query("truncate repos, auth.users restart identity cascade");
  const repo = await client.query(
    "insert into repos (slug, url, language, license) values ($1, $2, $3, $4) returning id",
    [manifest.slug, manifest.url, manifest.language, manifest.license],
  );
  const snapshot = await client.query(
    "insert into snapshots (repo_id, sha, name, manifest_url) values ($1, $2, $3, $4) returning id",
    [repo.rows[0].id, SHA, NAME, `/snapshots/${NAME}/manifest.json`],
  );
  const snapshotId = snapshot.rows[0].id;

  const languages = new Map(manifest.files.map((file) => [file.path, file.language]));
  const contents = new Map();
  const fileIds = new Map();
  for (const { relative, full } of walk(path.join(SNAPSHOT_DIR, NAME, "files"))) {
    const content = readFileSync(full, "utf8");
    contents.set(relative, content);
    const file = await client.query(
      `insert into files (snapshot_id, path, size, language, content)
       values ($1, $2, $3, $4, $5) returning id`,
      [snapshotId, relative, Buffer.byteLength(content), languages.get(relative) ?? "other", content],
    );
    fileIds.set(relative, file.rows[0].id);
  }

  const addOccurrence = async (symbolPk, file, line, token, role) => {
    const col = columnOf(contents.get(file), file, line, token);
    await client.query(
      `insert into occurrences (symbol_pk, file_id, line, col, end_col, role)
       values ($1, $2, $3, $4, $5, $6)`,
      [symbolPk, fileIds.get(file), line, col, col + token.length, role],
    );
  };
  for (const symbol of SYMBOLS) {
    const name = symbol.id.split("#")[1];
    const { rows } = await client.query(
      `insert into symbols (snapshot_id, file_id, symbol_id, name, kind, start_line, end_line)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [snapshotId, fileIds.get(symbol.file), symbol.id, name, symbol.kind, ...symbol.lines],
    );
    const pk = rows[0].id;
    await addOccurrence(pk, symbol.file, symbol.definition[0], symbol.definition[1], "definition");
    for (const [file, line, token] of symbol.references) {
      await addOccurrence(pk, file, line, token, "reference");
    }
  }

  for (const item of PUZZLES) {
    const { rows } = await client.query(
      `insert into puzzles (snapshot_id, slug, type, difficulty, title, prompt, answer_kind,
                            answer_json, set_count, choices, hints, tags, verified_by, published)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11::jsonb, $12, $13, true)
       returning id`,
      [
        snapshotId,
        item.slug,
        item.type,
        item.difficulty,
        item.title,
        item.prompt,
        item.kind,
        JSON.stringify(item.key),
        item.setCount,
        item.choices === null ? null : JSON.stringify(item.choices),
        JSON.stringify(item.hints),
        item.tags,
        item.verifiedBy,
      ],
    );
    await client.query("insert into solutions (puzzle_id, body_md) values ($1, $2)", [
      rows[0].id,
      solutionFor(item),
    ]);
  }
}
