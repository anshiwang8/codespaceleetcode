# Spec: Codebase Puzzles

A LeetCode-style site where every puzzle is set in a real open-source repository, pinned to a commit. Users read the code in a browser IDE and submit a precise answer, which is graded automatically. Each puzzle comes with a written solution.

Scope for v1: **Find**, **Trace**, and **Architecture** puzzles. No code execution, no bug fixing, no AI mode.

---

## 1. Core principle: every puzzle has one checkable answer

The product only works if grading is objective. Each puzzle must have exactly one correct answer, or a closed, enumerated set of equivalent answers. Three rules make that hold:

1. **Answers are references, never prose.** Every answer is a canonical ID taken from the snapshot's code index (a symbol, a file, a line span, or a choice ID). The grader compares IDs. It never interprets text.
2. **Users answer by selecting, not typing.** The UI collects answers by clicking symbols, files, or lines in the viewer ("Select as answer"). Users never type a path or name, so there is no formatting ambiguity.
3. **No puzzle is published until it is proven unique.** The CI validator and a blind second solve (section 6) must both pass.

If an author cannot write a prompt that has one answer, the puzzle is rejected. It does not ship with a fuzzy grader.

---

## 2. Puzzle types

### Find
Locate one specific thing in the codebase.
- Examples: "Which function decides whether a route path matches a trailing slash?" "In which file is the default request timeout defined?"
- Answer kinds: `symbol`, `file`, `location`.

### Trace
Follow execution or data flow between two fixed points.
- Example: "Starting at `app.listen`, list the functions called, in order, until the first byte of an HTTP response is written. Direct calls only."
- Answer kind: `sequence`.
- The prompt must name the start symbol and the end condition, and state whether calls are direct or transitive.
- A call edge means a reference inside a function body, so it also covers functions passed as values and some property reads. In a real audit, 60–89% of edges were written as literal calls. Authors must read the code to confirm each step. A Python constructor call points at the class, not `__init__`. TypeScript's `new Foo` points at `Foo.<constructor>` when one exists. Interface calls point at the interface method, not an implementation.

### Architecture
Understand structure: module responsibilities, boundaries, dependencies, extension points.
- Examples: "Select every module that imports the session store directly." "To add a new compression codec, which single file would you register it in?"
- Answer kinds: `set`, `symbol`, `file`, `choice`.

---

## 3. Answer kinds and grading

All answer IDs come from the snapshot index, so every one exists at the pinned SHA.

**ID formats**
- File: `src/router/index.ts`
- Symbol: `src/router/index.ts#Router.handle`, using the SCIP-derived qualified name. Same-name collisions in one file get a `~N` suffix in index order.
- Location: `src/router/index.ts:L120-L135`

Lines and columns are 1-based everywhere. Columns count UTF-16 units, matching Monaco.

Split a symbol ID on its first `#`, since private TypeScript members add another (`src/hono-base.ts#Hono.#dispatch`). IDs can contain `<get>`, `<set>` and `<constructor>`. A symbol's range runs from its first definition through its last, so overload signatures and their body count as one symbol.

| Kind | User submits | Correct when |
|---|---|---|
| `symbol` | One symbol ID | Equals `answer.id`, or is in `answer.accept` |
| `file` | One file path | Equals `answer.path`, or is in `answer.accept` |
| `location` | A line selection in one file | Same file, the selection covers every line in `answer.anchor`, and the selection lies within `answer.window` |
| `sequence` | Ordered list of symbol IDs | Exact ordered match with `answer.ids`, or with one of `answer.accept_sequences` |
| `set` | Unordered set of IDs | Set equality with `answer.ids` |
| `choice` | One option ID | Equals `answer.option` |

Grading rules:
- `location` exists for answers that aren't a whole symbol, such as a config block or a specific branch inside a function. `anchor` is the minimal set of lines that must be selected. `window` is the maximum span allowed (at most 30 lines), which stops users from selecting the whole file. Prefer `symbol` whenever the target is a whole symbol.
- `set` puzzles **show the required count** ("Select all 3"). This removes "did I find them all?" ambiguity, and costs little difficulty.
- `accept` / `accept_sequences` are only for genuinely equivalent answers, such as a re-export alias of the same function. Each entry needs a written reason in `answer.accept_reasons`.
- No partial credit in v1. Each submission is either correct or incorrect.

---

## 4. Puzzle authoring rules

A prompt must pin down everything that could otherwise produce a second valid answer:

- **Scope.** Name the directory or package when the same name exists in more than one place. Exclude tests, examples, vendored code, and generated code unless they are the subject.
- **Definition vs. usage.** Say "the function that defines X" or "the call site that triggers X", never just "where X happens".
- **Direction and depth (Trace).** Give the start symbol, the end condition, direct vs. transitive calls, and how to handle stdlib and third-party calls. The default is to skip them, and the prompt must say so.
- **Runtime path (Trace).** Fix the configuration, e.g. "with default options" or "for a GET request".
- **Granularity.** Specify the answer kind in the prompt ("Select a function", "Select a file", "Select the lines").
- **No reliance on comments or docs** as the only evidence. The answer must be derivable from the code.
- **One concept per puzzle.** If a prompt needs "and", split it into two puzzles.

### Puzzle file format

One YAML file per puzzle at `content/puzzles/<repo-slug>/<puzzle-id>.yaml`, validated against `content/schema/puzzle.schema.json`.

```yaml
id: hono-find-003
snapshot: honojs-hono@17ad0e2                # must exist in content/repos.yaml
type: find                                    # find | trace | architecture
difficulty: easy                              # easy | medium | hard
title: Trailing slash decision
prompt: |
  In src/router/, select the function that decides whether a request path
  with a trailing slash matches a route defined without one. Select a function.
answer:
  kind: symbol
  id: src/router/layer.ts#Layer.match
  accept: []
  accept_reasons: []
hints:
  - Routes are matched layer by layer.
solution: solutions/hono-find-003.md          # relative to content/
tags: [routing, http]
authors: [anshi]
verified_by: []                               # filled in by the blind second solver
```

Trace example:

```yaml
answer:
  kind: sequence
  ids:
    - src/core/app.ts#App.listen
    - src/core/app.ts#App.handle
    - src/router/index.ts#Router.handle
    - src/router/layer.ts#Layer.run
  accept_sequences: []
```

The other answer kinds:

```yaml
answer: { kind: file, path: src/config.ts, accept: [], accept_reasons: [] }
answer: { kind: location, path: src/config.ts, anchor: [120, 121], window: [118, 135] }
answer: { kind: set, ids: [src/a.ts, src/b.ts, src/c.ts] }
answer: { kind: choice, option: b }
```

`anchor` and `window` are `[first_line, last_line]`, inclusive. A `choice` puzzle also has a top-level `choices` list of `{ id, label }`, which is the only part of it clients may see.

### Solutions

Each `solutions/<id>.md` contains: the answer, the navigation path a strong engineer would take (where to start, what to search for, which definitions to jump to), and why plausible wrong answers are wrong. Solutions are only visible after a correct submission. There is no "give up".

---

## 5. Repositories

Defined in `content/repos.yaml`:

```yaml
- slug: honojs-hono
  url: https://github.com/honojs/hono
  sha: 17ad0e2...           # full 40-char SHA, immutable once puzzles reference it
  language: typescript
  license: MIT
```

Each slug appears once. `url` must be a plain `https://` URL with no credentials, since git fetches it and every puzzle page links to it.

Selection criteria for v1:
- Permissive or copyleft OSS license (MIT, Apache-2.0, BSD, GPL). Keep the license file in the snapshot and show attribution on every puzzle page.
- 5k–100k lines of non-test source.
- Languages: TypeScript/JavaScript, Python, Go. Each must have a working SCIP indexer. The localhost MVP covers TypeScript/JavaScript and Python; Go comes later.
- Target 10–15 repos at launch, with 4+ puzzles each across all three types.
- The index must support the puzzles. Plain CommonJS can leave most method calls unresolved (see section 7), so a repo needs enough real call edges for its Trace puzzles.

A snapshot is immutable. To move a repo to a newer commit, create a new snapshot and port the puzzles explicitly.

---

## 6. Validation pipeline (CI)

`content/` changes run `pnpm validate` (calls `uv run python -m ingest validate`). A puzzle merges only if all checks pass. It needs the snapshots in `ingest/out/`, which aren't committed, so CI has to build or restore them first. No CI workflow exists yet.

A content folder with no puzzles fails, because seeding treats a puzzle missing from content as removed. Override reasons stay in the puzzle file and aren't printed, since they can name the answer.

Only `symbol-unique`, `sequence-edges` and `sequence-alternate-path` can take a `validator_overrides` entry. `set-count`, `location-window` and `choice-options` can't, because each failure means the puzzle can't be solved or graded as written.

**Schema**
- The YAML matches the JSON schema. The ID is unique. The snapshot exists. The solution file exists.

**Existence**
- Every answer ID (`id`, `ids`, `accept*`, `path`, `anchor`, `window`) resolves in the snapshot index.

**Uniqueness heuristics** (failures need an explicit `validator_overrides` entry with a reason)
- `symbol`: if another definition shares the answer's short name inside the prompt's stated scope, fail unless it is listed in `accept`. Naming the answer's file narrows the scope to that file, so a same-named definition inside it still fails. A stated scope is a prompt token exactly matching a manifest path that contains the answer. A directory needs a slash (`lib/`), and if several qualify the widest wins, so naming a directory that contains the answer widens the scope past the answer's file even when the file is named too. With none, the scope is the whole snapshot.
- `sequence`: each consecutive pair must be a real caller→callee edge in the SCIP reference graph. If the start symbol has another path to the end condition of equal or shorter length, warn.
- `set`: each member exists. The count shown in the UI equals `len(ids)`.
- `location`: `anchor` ⊆ `window`, and `window` ≤ 30 lines.
- `choice`: exactly one option is marked correct, and there are 3–5 options.

**Blind second solve (human)**
- A second person solves the puzzle without seeing the answer key, then adds their name to `verified_by`. If their answer differs from the key, either the key is wrong or the prompt is ambiguous. Fix the prompt. Never fix this by adding to `accept` unless the two answers are truly equivalent.
- Publishing requires `verified_by` to be non-empty. The validator fails (`verifier-not-author`) when a `verified_by` name is also an author, comparing names without an `agent:` prefix and ignoring case.
- For the localhost MVP, a separate agent that never sees the key may do this solve, recorded as `agent:<name>`. The puzzle page shows that no person has checked it. Replace these with human solves before a public launch.
- `blind-check` gives each solver one graded attempt at each version of a puzzle. The first result is kept in `content/blind-attempts.json`, and a rerun repeats it instead of grading again, so a solver can't guess until it passes. A version is a hash of what `blind-export` shows, never of the key, so rewording a prompt allows a fresh solve. Unknown and malformed answers don't use the attempt. The ledger is committed with the content; if a key was wrong, delete that solver's entry for the puzzle by hand.

---

## 7. System architecture

### Stack
| Layer | Choice |
|---|---|
| Web app | Next.js (App Router) + TypeScript (strict), deployed on Vercel |
| Code viewer | Monaco (`@monaco-editor/react`) + custom file tree |
| DB + auth | Supabase: Postgres, GitHub OAuth |
| Code storage | Cloudflare R2 behind CDN: raw files + `manifest.json` per snapshot |
| Code intelligence | SCIP indexers (`scip-typescript`, `scip-python`, `scip-go`), converted into Postgres tables |
| Search | Postgres `pg_trgm` over file contents |
| Ingestion + validation | Python (uv), run locally and in GitHub Actions |
| Content | YAML + Markdown in `content/`, seeded into Postgres |

SCIP, not plain tree-sitter, is required for v1. Unique answers depend on precise definitions and resolved references. Name-matched references would make `sequence` validation and symbol uniqueness checks unreliable.

tree-sitter has two narrow jobs, both anchored to an exact SCIP position: finding where a definition ends when the indexer gives no range, and naming top-level `root.name = function () {}` methods that scip-typescript leaves undefined. Those promoted methods get IDs, but a call to one only becomes an edge if SCIP itself resolved it.

### Fetching untrusted repos

The pipeline never runs a fetched repo's code. It doesn't install dependencies or run scripts. Indexers run with the stage folder as their working directory, so Windows executables are left out of that folder and `NoDefaultCurrentDirectoryInExePath` stops the npm `.cmd` shims finding a repo's own `node.cmd`. Symlinks are checked out as plain text files.

### Localhost mode

The site runs on localhost with no accounts or keys. Each hosted service has a local stand-in, and the app reaches it through the same interface:

| Hosted | Local stand-in |
|---|---|
| Supabase Postgres | Real Postgres from the `embedded-postgres` npm package, data in `.localdb/`, always UTF-8. `supabase/local/shim.sql` adds the roles and `auth` schema Supabase provides, so migrations run unchanged |
| Supabase GitHub OAuth | A dev login that sets a cookie, refused unless the request is from localhost and `NODE_ENV` isn't `production` |
| R2 behind a CDN | The route `/snapshots/<name>/...` serves `ingest/out/<name>/...` with an ETag and `Cache-Control: public, no-cache`, because a rebuilt snapshot keeps its name. `NEXT_PUBLIC_SNAPSHOT_CDN_URL` overrides it when set |

GitHub OAuth, R2 upload and deployment aren't built yet. They're needed before a public launch.

### Repository layout
```
/web                 Next.js app
/ingest              Python: clone, filter, index, upload, seed, validate
/content
  repos.yaml
  schema/puzzle.schema.json
  puzzles/<repo-slug>/<id>.yaml
  solutions/<id>.md
  blind-attempts.json   each blind solver's first graded result per puzzle version
/supabase/migrations SQL migrations
spec.md
CLAUDE.md
DEVLOG.md
```

### Ingestion flow (offline)
```
repos.yaml
  → git clone + checkout pinned SHA
  → filter: drop vendored dirs, binaries, generated files, files > 1 MB
  → run SCIP indexer → index.scip
  → convert: files, symbols, occurrences, call edges → Postgres
  → upload files + manifest.json → R2 at /snapshots/<slug>@<sha>/
  → validate content/puzzles → seed puzzles + solutions → Postgres
```

### Runtime flow
```
puzzle list → puzzle page
  → GET puzzle (prompt, type, answer kind, count for sets; no answer key)
  → manifest.json from CDN → file tree
  → open file → raw file from CDN → Monaco
  → open file → /api/snapshots/:id/symbols/outline (the file's symbols)
  → hover / click symbol → /api/snapshots/:id/symbols (definition, references)
  → search → /api/snapshots/:id/search
  → "Select as answer" builds the submission from canonical IDs
  → POST /api/puzzles/:slug/submit → server grades → { correct, attempts }
  → on correct → GET solution
```

---

## 8. Data model

The source of truth is `supabase/migrations/`.

```sql
repos        (id, slug, url, language, license)
snapshots    (id, repo_id, sha, name, manifest_url, indexed_at,
              content_hash)                                          -- name = <slug>@<sha>; hash of the built files
files        (id, snapshot_id, path, size, language, content)        -- content: pg_trgm index
symbols      (id, snapshot_id, file_id, symbol_id, name, kind,
              start_line, end_line)                                  -- symbol_id = canonical ID
occurrences  (symbol_pk, file_id, line, col, end_col, role)          -- role: definition | reference
call_edges   (snapshot_id, caller_symbol_id, callee_symbol_id)
puzzles      (id, snapshot_id, slug, type, difficulty, title, prompt,
              answer_kind, answer_json, set_count, choices, hints, tags,
              verified_by, published)
solutions    (puzzle_id, body_md)
users        (id, github_login, created_at)                          -- via Supabase auth
submissions  (id, user_id, puzzle_id, answer_json, correct, created_at,
              time_on_puzzle_ms)
progress     (user_id, puzzle_id, status, attempts, solved_at)        -- status: attempted | solved
```

`answer_json` and `solutions` are only readable through server routes. The server connects with `pg` and `DATABASE_URL` in every environment, and refuses to run in production without it; nothing uses a Supabase client or the service role key. Row-level security and column grants deny client access.

Hosted Supabase grants `anon` and `authenticated` everything on each new table, sequence and function in `public`, and `supabase/local/shim.sql` does the same locally. So a migration that adds a table must enable row-level security, revoke client privileges on it and its sequences, and grant back only what clients may read. `web/tests/rls.test.ts` fails if a table has no row-level security, if clients hold any grant beyond the expected reads, or if they can use a sequence. Migration 0004 revokes the sequence privileges 0001 missed.

---

## 9. API

| Route | Method | Returns |
|---|---|---|
| `/api/puzzles` | GET | List with filters (type, difficulty, repo, tag) and the user's status |
| `/api/puzzles/:slug` | GET | Prompt, metadata, answer kind, set count, snapshot info. **Never the key.** |
| `/api/puzzles/:slug/submit` | POST | `{ correct, attempts }` |
| `/api/puzzles/:slug/solution` | GET | Solution markdown, only if solved |
| `/api/snapshots/:id/symbols?file=&line=&col=` | GET | Definition + references at a position, capped at 500, with `referencesTruncated` when there are more |
| `/api/snapshots/:id/symbols/outline?file=` | GET | Symbols in a file |
| `/api/snapshots/:id/search?q=` | GET | File/line matches, capped at 200 |
| `/api/me` | GET | The signed-in user, and whether dev login is available |
| `/api/me/stats` | GET | Solved counts by type and difficulty |
| `/api/dev/login`, `/api/dev/logout` | POST | Localhost mode only: start or end a dev session |
| `/snapshots/<name>/<path>` | GET | Localhost mode only: `manifest.json` or a raw file |

Response shapes live in `web/lib/api-types.ts`. Submit validates that every submitted ID exists in the snapshot before grading. Submit and search are rate-limited, in memory and per process, so a real deployment needs a shared store. Reading a puzzle needs no sign-in; submitting does.

- Signed-out requests to `/solution` and `/api/me/stats` get 401. A signed-in user who hasn't unlocked a solution gets 403.
- Every graded submission counts as an attempt, including ones after solving. A rejected request doesn't.
- `solved` is final: later submissions are graded and counted, but never change the status. The one exception is a changed answer key: seeding then regrades that puzzle's submissions and recomputes each user's status, keeping each submission's recorded `correct`.
- An unknown or malformed puzzle slug is a 404, from `/api/puzzles/:slug` and from the puzzle page. The page checks in `app/puzzles/[slug]/layout.tsx`, before its `loading.tsx` starts streaming, and the list page's `loading.tsx` sits in the `app/(list)` route group so it doesn't wrap puzzle pages.
- Signed-out requests are limited by IP: the last `X-Forwarded-For` entry, which the nearest proxy added after anything the client sent. Vercel sends the client's address alone. Queries under 3 characters can't use the trigram index, so they also count against a tighter limit of 30 a minute.
- Search is case-insensitive. The Postgres planner chooses between the trigram index and the path index, because forcing trigram was only faster when nothing matched.

---

## 10. UI

- **Puzzle list:** filter by type, difficulty, repo; solved state per row.
- **Puzzle page:** prompt panel (left), file tree + Monaco + search (center), answer tray (right).
  - The answer tray shows the required kind, the current selection, and for `set` the "n of N selected" count. For `sequence`, an ordered list with drag to reorder.
  - Go-to-definition (F12 / ctrl-click, cmd-click on macOS), find references, and a breadcrumb trail of visited files.
  - Repo name, SHA, license, and link back to GitHub at that SHA.
- **Result:** correct / incorrect, attempt count. Solution unlocks on a correct answer.
- **Profile:** solved counts by type and difficulty.

---

## 11. Non-goals for v1

- Bug-fix puzzles and any code execution
- AI-assisted mode
- User-submitted puzzles or private repos
- Partial credit, leaderboards, contests
- Mobile-optimized IDE (read-only puzzle list must work on mobile)

---

## 12. Milestones

1. **Ingest:** pipeline for 3 repos (one per language); files on R2; index in Postgres.
2. **Viewer:** file tree, Monaco, search, go-to-definition, find references.
3. **Puzzles:** schema, validator in CI, grader, answer tray, 30 puzzles with blind second solves.
4. **Users:** GitHub auth, submissions, progress, solutions unlock.
5. **Launch content:** 10–15 repos, 60+ puzzles.

---

## 13. Open questions

- Should `location` answers be dropped entirely in favour of `symbol` + `choice`? Decide after authoring the first 30 puzzles.
- Show set counts on every `set` puzzle, or only on easy and medium?
- Time-based scoring, or solved/unsolved only?
