# Spec: codebases

A LeetCode-style site where every puzzle is set in a real open-source repository, pinned to a commit. Users read the code in a browser IDE and submit a precise answer, which is graded automatically. Each puzzle comes with a written solution.

Scope for v1: **Find**, **Trace**, **Architecture** and **Design** puzzles. No code execution, no bug fixing, no AI mode. **Build** puzzles, where users write and run code, are a v2 plan (section 15), not part of v1.

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

### Design
Take a system-design question of the kind asked in coding interviews, and answer one requirement of it from a real implementation: which data structure the code uses and what an operation costs, what happens in an edge case, or which lines enforce an invariant.
- Examples: "Design an LRU cache. What does reading a key that isn't the most recent one cost in Jinja's `LRUCache`, and why?" "Design a key-value store that spreads keys over several backends. When a batch write spans two backends, which driver calls does unstorage make?" "Design a reactive state system. Select the lines that decide which effects run again when an array is shortened."
- Answer kinds: `choice`, `symbol`, `location`, `set`.
- The prompt opens with `Interview question:`, the system to design and the one requirement the puzzle is about, then names where the real implementation lives and asks one question about it. Users still select their answer, and it's still graded by ID: a Design puzzle never asks the user to write a design or code.
- Where Architecture asks how modules divide the work (who imports what, where a new piece is registered), Design asks how a mechanism behaves and what it costs. The answer must follow from the code, plus documented behavior of the language and its standard library (that `deque.remove` scans, that a `Set`'s iterator visits entries added during the loop). A choice that turns on anything else, such as a benchmark or a guess about intent, doesn't belong.
- A solution explains the code and also what a strong interview answer would say: the trade-off this implementation makes and the usual alternative.

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

### Difficulty

Difficulty measures how much navigation and reasoning the answer takes, not how obscure the code is.

- **easy:** one hop. The prompt names the file, or a directory with few candidates. One search or one jump to a definition finds the answer, with at most one plausible decoy. A trace has 2–3 steps.
- **medium:** 2–4 hops across files, or a careful read of one long function where several candidates look plausible. A trace has 3–5 steps across files.
- **hard:** the answer depends on indirection (dynamic dispatch, registries, callbacks passed as values, configuration-dependent paths) across several files, or on runtime ordering or state. Decoys look right on a quick read. A trace has 5 or more steps, or a tempting shortcut that the prompt's runtime conditions rule out.

### Topics

`tags` holds 1 to 3 topics from a fixed list, and the schema rejects anything else. The site groups and filters by topic, so a tag used on one puzzle would be a filter with one result. Each topic's label and description are in `web/lib/topics.ts`, and a web test checks that list against the schema's enum. To add a topic, add it to both and retag the puzzles it covers.

`routing`, `middleware`, `request-lifecycle`, `errors`, `http-clients`, `retries-and-timeouts`, `reactivity`, `compilers`, `validation`, `dependency-injection`, `extension-points`, `configuration`, `state-management`, `caching-and-storage`, `observables`, `auth-and-security`, `code-structure`, `command-line`.

### Puzzle file format

One YAML file per puzzle at `content/puzzles/<repo-slug>/<puzzle-id>.yaml`, validated against `content/schema/puzzle.schema.json`.

```yaml
id: hono-find-003
snapshot: honojs-hono@17ad0e2                # must exist in content/repos.yaml
type: find                                    # find | trace | architecture | design
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
tags: [routing, http-clients]                 # 1 to 3 topics, see Topics below
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

A solution is a detailed explanation, not just the answer, and solutions don't all share one layout. It starts with `# <id>: <title>` and an `**Answer:**` line. After that the author picks what helps: a diagram of the flow or module structure, short code excerpts with `path:line` references, a table of candidates, background on the design, and takeaways. The format is GitHub-flavored Markdown with raw HTML stripped. Fenced ` ```mermaid ` blocks render as diagrams, and ` ```text ` blocks hold ASCII trees. Every claim must hold at the pinned SHA.

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
| Database | Supabase Postgres |
| Auth | Better Auth with GitHub sign-in, sessions stored in the same Postgres |
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
| GitHub sign-in | Works on localhost too, given a GitHub OAuth app whose callback is `http://127.0.0.1:3000/api/auth/callback/github`. Without one, a dev login that sets a cookie stands in. The dev login is refused unless the request is from localhost and `NODE_ENV` isn't `production` |
| Email delivery (Resend) | Without `RESEND_API_KEY` and `EMAIL_FROM`, outside production, each message is written as a JSON file to `DEV_OUTBOX_DIR` (default `web/.dev-outbox/`, ignored by git) instead of being sent. Settings says so. Production without them says email is unavailable |
| R2 behind a CDN | The route `/snapshots/<name>/...` serves `ingest/out/<name>/...` with an ETag and `Cache-Control: public, no-cache`, because a rebuilt snapshot keeps its name. `NEXT_PUBLIC_SNAPSHOT_CDN_URL` overrides it when set |

`python -m ingest upload` puts snapshots in R2 (section 14, C2). Creating the bucket and the Vercel deployment need a person with the accounts; section 14 lists the steps.

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
landing page → puzzle list → puzzle page
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
users        (id, github_login, created_at)                          -- id = auth_users.id
auth_users, auth_sessions, auth_accounts, auth_verifications        -- Better Auth's tables
submissions  (id, user_id, puzzle_id, answer_json, correct, created_at,
              time_on_puzzle_ms)
progress     (user_id, puzzle_id, status, attempts, solved_at)        -- status: attempted | solved
rate_limits  (key, count, window_start)                               -- shared by every server instance
user_profiles      (user_id, display_name, pronouns, bio, birthday, links, updated_at)
user_preferences   (user_id, theme_mode, theme_id, favorite_themes, updated_at)   -- theme_mode: theme | system
user_avatars       (user_id, image, content_type, version, updated_at)            -- WebP bytes, at most 128 KB
user_emails        (user_id, email, verified_at)                                  -- unique lower(email)
email_verifications (id, user_id, email, purpose, token_hash, expires_at,
                     consumed_at, created_at)                                     -- purpose: setup | change
```

Migration 0007 adds the five settings tables. Migration 0008 adds `design` to the check on `puzzles.type`. Each row belongs to one user and is deleted with them; every table has row-level security on and no client grants, since only the server reads them.

Hosted migrations are applied by `python -m ingest migrate`, which records each file and its SHA-256 in `migrations.applied`, a schema clients can't reach. It refuses to continue if an applied file changed, if files would apply out of order, or if the database has a migration the checkout doesn't. Locally, `scripts/localdb.mjs` does the same job with `public.schema_migrations`.

Deleting an account (`DELETE /api/me`) removes the `auth_users` row, which cascades to the user's sessions, linked GitHub account and token, `users` row, submissions, progress, profile details, links, theme preference, picture, contact email and pending email links, and deletes their `rate_limits` rows (every per-user key ends in `user:<id>`).

`answer_json` and `solutions` are only readable through server routes. The server connects with `pg` and `DATABASE_URL` in every environment, and refuses to run in production without it; nothing uses a Supabase client or the service role key. Row-level security and column grants deny client access.

### Auth

Better Auth runs inside the Next.js app (`web/lib/server/better-auth.ts`, mounted at `/api/auth/*`) and stores its users, sessions, linked accounts and verification tokens in the four `auth_*` tables, through the same `pg` pool as everything else. GitHub is the only sign-in method. Ids are UUIDs, so `users.id` references `auth_users.id`.

- A first GitHub sign-in creates the `auth_users` row, then a hook creates the matching `users` row with the GitHub login. Submissions and progress keep pointing at `users`.
- The session lives in an HTTP-only cookie. `getCurrentUser` reads it with `auth.api.getSession`, then the `users` row. It falls back to the dev login only where the dev login is allowed.
- Signing in again with GitHub never changes what the user manages in Settings: display name, pronouns, bio, birthday, links, picture, theme and contact email live in their own tables, which Better Auth doesn't touch. The profile never uses GitHub's name or avatar.
- The GitHub email isn't kept. The stored email is a placeholder made from GitHub's numeric id, so it's unique, never changes, and works for accounts whose email is private. Account linking is off, so two GitHub accounts never join one user.
- The GitHub access token is stored encrypted and never handed out. The Better Auth routes the app doesn't use are disabled: editing the user, changing email, linking accounts, and reading tokens.
- Origin checks are on everywhere, including tests. In production `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` are required, and only that origin is trusted. Without `BETTER_AUTH_URL`, in dev, the trusted origin is the request's own Host, and only when it's a loopback address.
- Clients never query the `auth_*` tables. Like every table, they have row-level security on and no client grants.

Hosted Supabase grants `anon` and `authenticated` everything on each new table, sequence and function in `public`, and `supabase/local/shim.sql` does the same locally. So a migration that adds a table must enable row-level security, revoke client privileges on it and its sequences, and grant back only what clients may read. `web/tests/rls.test.ts` fails if a table has no row-level security, if clients hold any grant beyond the expected reads, or if they can use a sequence. Migration 0004 revokes the sequence privileges 0001 missed.

### Settings, pictures and contact email

`/settings` is where a signed-in user changes their account. Each section saves on its own with Save and Cancel, shows field errors inline, and warns before leaving with unsaved changes.

- **Profile details** (`web/lib/profile-fields.ts`, checked the same way in the browser and on the server): optional display name (60 characters), pronouns (40), bio (280, line breaks allowed) and birthday. One-line fields refuse line breaks, control characters and direction overrides. A birthday is a real date from 1900 through today in UTC+14 (so it's never refused as "future" anywhere on Earth), Feb 29 only in leap years, stored as a date only, private, and never turned into an age. Empty clears a field.
- **Links:** LinkedIn, GitHub, website, X, Bluesky, Mastodon, and up to 3 labeled custom links. Each must be `https://` with no credentials, port, IP address or single-label host, and at most 300 characters. A platform link's host must be the platform's own domain or a subdomain of it, compared exactly, never by substring, with a profile path; Mastodon accepts any server with a `/@name` path. Links render as plain links with `rel="noopener noreferrer nofollow"`, labels as text. The GitHub link is separate from the GitHub account used to sign in.
- **Picture** (`web/lib/server/avatar.ts`): JPEG, PNG or WebP up to 4 MB (under Vercel's 4.5 MB request body limit), uploaded as raw bytes with a square crop. sharp decodes it and decides the format from its contents, refusing anything else (SVG, GIF, HEIF, TIFF), animated images, and sides over 8000 pixels. It applies the EXIF orientation, crops, resizes to 256×256, flattens, and re-encodes as WebP, which drops all metadata. The bytes live in `user_avatars`; `/api/me/avatar?v=<version>` serves them only to their owner, `private` and immutable for that version. Without a picture, or if one fails to load, the avatar is a white head-and-shoulders silhouette on a neutral gray circle, everywhere. GitHub's avatar is never used.
- **Contact email** (`web/lib/server/email.ts`): separate from Better Auth's placeholder. A signed-in user without a verified address sees a banner and `/settings/email`; practice isn't blocked. Adding or changing an address sends a link to it; the address is used only once that link is opened while signed in as the same user. Tokens are 256 random bits, stored only as a SHA-256 hash, bound to the user and purpose (`setup` or `change`), single-use, and expire after 30 minutes. A newer request replaces an older pending one. Changing a verified address needs a GitHub sign-in in the last 15 minutes, keeps the old address until the new one is confirmed, then tells the old address (masked) that it changed. An address another account uses gets the same "check your inbox" response and a pending entry that can never be confirmed, plus a notice at that address, so the form never reveals who has an account. Requests are limited to 5 an hour and confirmations to 20 per 10 minutes per user. The verify page takes the token from the URL, removes it with `history.replaceState`, posts it once, and sends no referrer. Addresses never appear in `/api/me`, the profile, logs or error messages; `/api/me/settings` returns the owner's own address.
- **Delivery** (`web/lib/server/email-delivery.ts`): Resend's HTTP API when `RESEND_API_KEY` and `EMAIL_FROM` are set; otherwise, outside production, the local outbox; otherwise none, and Settings says email can't be sent right now. A failed send removes the pending entry and says to try again. Tests swap in a fake sender.

### Themes

189 themes: **codebases Light** (`default-light`, the default, the original white and blue), **codebases Dark** (`default-dark`), and 187 adapted from Monkeytype's preset palettes (GPL-3.0, credited in `docs/themes/README.md`) under original names. `docs/themes/MAPPING.md` maps every source preset to its codebases ID and name and lists what was changed. Monkeytype's branding, logos, decorative assets and custom CSS effects aren't used.

- `web/lib/themes/tokens.ts` is the typed registry of 55 semantic tokens (surfaces, text, accent, status, difficulty, heat, syntax, editor, avatar, shadow). `derive.ts` turns a preset's five colors into all of them, and `web/tests/themes.test.ts` generates `catalog.generated.ts` and `MAPPING.md` (`UPDATE_THEMES=1`) and checks every theme: all tokens present and safe, unique IDs and names, no duplicate palettes, text at least 7:1 and secondary text 4.5:1 on every surface, buttons, status colors on their own tints, indicators 3:1, rising heat levels, red and green apart in hue, and syntax colors 4.5:1. A background is moved away from mid-gray when no text color could reach 7:1 on it.
- **System** follows the device between codebases Light and codebases Dark.
- **Choosing:** Settings → Appearance, or the Theme button on the profile page (beside "Browse puzzles", and on the signed-out profile too, so it works without an account), which opens the same picker in a dialog. The header has no theme control. Search, All, Light, Dark and Favorites, swatches, a small preview, the saved theme marked, favorites, and arrow keys. Choosing previews the theme on the whole page; Apply saves it, Cancel or Escape (or leaving) puts the saved one back. Restore default goes back to codebases Light.
- **Where it's kept:** signed in, in `user_preferences`, so it follows the account. Signed out, in `localStorage` for that browser. The account's choice wins over the browser's; the browser's applies only while signed out. The applied theme is cached in `localStorage` (`cb-theme`) tagged with a hash of the owner, so signing out or in as someone else never keeps another person's theme.
- **First paint:** an inline script in `app/layout.tsx` reads that cache and sets the tokens on `<html>` before anything renders, including on the static landing page. It applies only custom properties named like tokens with `#rrggbb` or `rgb(r g b / n%)` values, so a tampered cache can't inject CSS.
- Monaco's theme is defined from the current tokens and swapped with `setTheme`, so changing themes never remounts the editor. Mermaid diagrams redraw from the tokens with the same strict settings.

### Security headers

`web/next.config.ts` sends these on every response, including API routes and snapshot files. `web/lib/security-headers.ts` builds them, and `web/tests/security-headers.test.ts` and `web/e2e/security-headers.spec.ts` check them.

- **Content Security Policy.** `default-src 'self'`. Nothing from another host can run as a script or style. `connect-src` adds only the origin of `NEXT_PUBLIC_SNAPSHOT_CDN_URL`, and a value that isn't an http or https URL stops the build. `worker-src 'self'` covers Monaco's bundled worker. `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `frame-ancestors 'none'`. Production adds `upgrade-insecure-requests`; `next dev` adds `'unsafe-eval'`, which React needs there.
- `script-src` allows `'unsafe-inline'`, because Next.js streams page data in inline scripts and a header in `next.config.ts` can't carry a per-request nonce. Moving to a nonce means setting the CSP in `proxy.ts` and rendering every page dynamically, the landing page included. `style-src` allows `'unsafe-inline'` because Monaco injects `<style>` elements, mermaid puts one in each SVG, and React writes `style` attributes.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`, without `preload`. Joining the preload list is hard to undo, so it's a separate decision.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: DENY` for browsers too old for `frame-ancestors`. `X-Powered-By` is off.

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
| `/api/me` | GET | The signed-in user (login, display name, picture version, whether an email is needed, appearance; never an address) and how they signed in, whether GitHub sign-in is configured, and whether dev login is available |
| `/api/me` | DELETE | Deletes the signed-in user's account and everything about them, and clears the session cookies. Needs `{ "confirm": true }` and a same-origin `Origin` header |
| `/api/auth/*` | GET, POST | Better Auth's own routes: GitHub sign-in, its callback, the session, sign-out |
| `/api/me/stats` | GET | Solved counts by type and difficulty |
| `/api/me/profile` | GET | The signed-in user's profile (`ProfileResponse`): identity, lifetime progress overall and by type, difficulty, repository and topic, lifetime submission count, unfinished puzzles, the last 365 days of activity, lifetime streaks, the first-solve timeline for that period, and the first page of history |
| `/api/me/history?before=&limit=&type=&difficulty=&repo=&outcome=&date=` | GET | One page of the signed-in user's submissions, newest first: puzzle, repository, whether it passed, and when. Filters (`outcome` is `passed` or `failed`, `date` a UTC `YYYY-MM-DD`) narrow the whole history on the server; `before` continues the same filtered list. `limit` defaults to 10 and is at most 50 |
| `/api/me/activity?period=` | GET | The activity calendar and first-solve timeline (`ActivityResponse`) for `rolling` (the last 365 UTC dates, the default) or a calendar year from the user's history through this year. Any other value is a 400 |
| `/api/me/settings` | GET | The signed-in user's settings (`SettingsResponse`): details, links, picture version, appearance, and email status, which includes their own address |
| `/api/me/details` | PUT | Saves display name, pronouns, bio and birthday. Field errors come back as `{ error, fields }` |
| `/api/me/links` | PUT | Saves the links |
| `/api/me/preferences` | PUT | Saves the theme preference and favorites |
| `/api/me/avatar?v=` | GET | The signed-in user's own picture, `private`, immutable per version |
| `/api/me/avatar?x=&y=&size=` | POST, DELETE | Uploads raw image bytes with a crop (limited to 20 an hour), or removes the picture |
| `/api/me/email` | POST, DELETE | Starts adding or changing the contact email, or cancels a pending one |
| `/api/me/email/resend` | POST | Sends a new link for the pending address |
| `/api/me/email/verify` | POST | Confirms a pending address with the token from the link, sent in the body |
| `/api/dev/login`, `/api/dev/logout` | POST | Localhost mode only: start or end a dev session |
| `/snapshots/<name>/<path>` | GET | Localhost mode only: `manifest.json` or a raw file |
| `/robots.txt`, `/sitemap.xml` | GET | For search engines. The sitemap lists `/`, `/puzzles`, the legal pages and every published puzzle, with absolute URLs on `BETTER_AUTH_URL`'s origin |
| `/opengraph-image` | GET | The 1200×630 PNG shown when a link to the site is shared |

Response shapes live in `web/lib/api-types.ts`. Submit validates that every submitted ID exists in the snapshot before grading. Submit and search are rate-limited in Postgres (`rate_limits`, migration 0006), so the limits hold across serverless instances. One upsert counts a request and resets an expired window, so concurrent requests can't both slip under a limit, and the database's clock is the one every instance uses. Better Auth's own limiter uses the same table through `rateLimit.customStorage`. About one request in a hundred also deletes windows older than an hour. Reading a puzzle needs no sign-in; submitting does.

- Signed-out requests to `/solution`, `/api/me/stats`, `/api/me/profile`, `/api/me/activity`, `/api/me/history` and every settings route get 401. Settings changes also need a same-origin `Origin` header. A signed-in user who hasn't unlocked a solution gets 403.
- Every graded submission counts as an attempt, including ones after solving. A rejected request doesn't.
- `solved` is final: later submissions are graded and counted, but never change the status. The one exception is a changed answer key: seeding then regrades that puzzle's submissions and recomputes each user's status, keeping each submission's recorded `correct`.
- An unknown or malformed puzzle slug is a 404, from `/api/puzzles/:slug` and from the puzzle page. The page checks in `app/puzzles/[slug]/layout.tsx`, before its `loading.tsx` starts streaming, and the list page's `loading.tsx` sits in the `app/(list)` route group so it doesn't wrap puzzle pages.
- Signed-out requests are limited by IP: the last `X-Forwarded-For` entry, which the nearest proxy added after anything the client sent. Vercel sends the client's address alone. Queries under 3 characters can't use the trigram index, so they also count against a tighter limit of 30 a minute.
- Search is case-insensitive. The Postgres planner chooses between the trigram index and the path index, because forcing trigram was only faster when nothing matched.

---

## 10. UI

The site is named **codebases**. The logo is the word in Arial, with "bases" in a blue box. The default theme, codebases Light, is a plain white background with a blue accent; users can pick any of 189 themes (section 8, "Themes").

- **Visual system:** colors, type sizes, spacing, radii and shared controls (`.btn`, `.select`, `.card`, `.badge`, `.meter`, `.empty`, `.page-message`) are tokens and classes in `web/app/globals.css`. General pages use 16px body text. The puzzle workspace keeps a denser 13px base and scales the shared controls down. A status is never shown by color alone: it always has text or an icon too. Animation is off under `prefers-reduced-motion`.
- **Copy:** everything the project writes is in US English (behavior, color, canceled, license). Auth actions are "Sign in" and "Sign out". The document is `lang="en-US"`, and dates and numbers are formatted with `en-US` (`web/lib/format.ts`). Upstream code, quoted source, identifiers and IDs keep their own spelling. Public empty and error states say what happened and what to do, never how to run the server.
- **Header (every page but the landing page):** the logo, Puzzles, Profile and Settings links (Settings is left out on a phone, where the account link reaches it), and the account area. The current page's link has `aria-current="page"` (a puzzle page marks Puzzles with `aria-current="true"`) and an underline. Signed in, it shows the user's picture or the default silhouette and the login (cut short with an ellipsis, and hidden on a phone except to screen readers), together linking to Settings, and Sign out. Without a verified contact email, a banner under the header links to `/settings/email`. A failed sign-in or sign-out shows in a dismissible banner under the header. A "Skip to content" link comes first.
- **Landing page (`/`):** static, and renders without the database. The top bar has the logo once. The hero says what the product is ("Practice reading code you didn't write") and what a puzzle asks, with no claim about interview trends. "Browse puzzles" opens the list. "Sign in with GitHub" (described as "to submit answers and save progress") starts GitHub sign-in and returns to the list, or says so if this server has no GitHub OAuth app. A line says reading needs no account.
  - Right below is a worked example (`components/landing/CodeDemo.tsx`): a question, verbatim lines of `psf/requests` at the pinned commit `3c7baaa`, how you'd get there, the answer as a canonical ID, and the feedback. It's captioned as a static example that isn't a puzzle, has no control-like elements, and links to the file on GitHub at that commit. Its answer, `CaseInsensitiveDict`, and its file must not be any puzzle's answer; `web/tests/landing.test.ts` checks this.
  - "How a puzzle works" is four numbered steps beside "What it doesn't do": no code runs, no partial credit, no solution before solving, a laptop-size workspace, and blind second solves done so far by an agent.
  - "Four kinds of puzzle" quotes one real published puzzle per type, two by two (`components/landing/examples.ts`), linking to it, with the answer shape and an ID format written with placeholders, never a real answer. The test checks each slug, title and quote against `content/puzzles`.
  - "Why practice this" says some interviews test code reading and plenty still ask algorithm questions. It ends with "Try an easy Find puzzle", which opens the list filtered to easy Find puzzles.
- **Puzzle list (`/puzzles`):** a title, the signed-in user's overall progress, then one panel with the difficulty strip, the filters and the grouping. Solved state per row, as an icon and text. With nothing published it says so, with no setup instructions; with no matches it offers to clear the filters. Below 860px each row becomes a card. Everything below lives in the URL (`type`, `difficulty`, `repo`, `tag`, `group`, `sort`), and the defaults are left out, so the plain list stays at `/puzzles`.
  - A difficulty strip: one bar split by difficulty, each segment's width its share of the puzzles and its filled part the share solved. Clicking a segment filters to that difficulty, and clicking it again clears the filter.
  - The strip's counts are taken under the other filters, so each says what clicking would show.
  - Type, topic and repo are drop-downs. Topics show by label.
  - Group by difficulty (the default), topic, repo, or none. Each group is a collapsible section headed with its solved count. A puzzle with two topics is listed under both. A column the heading already gives (difficulty or repo) is left out of that section's rows. Grouped by topic, each section shows the topic's description.
  - Clicking a column header sorts every section by that column, A to Z, except difficulty, which goes easiest first. Clicking it again reverses the order. Ties keep the default order, by puzzle ID.
  - Signed out, counts say how many puzzles there are instead of how many are solved.
- **Puzzle page:** prompt panel (left), file tree + Monaco + search (center), answer tray (right).
  - The prompt panel has two tabs. **Description** holds the prompt, answer kind and hints. **Solution** shows a locked state until the puzzle is solved, and the solution is never fetched before then. After a correct answer the tab is marked unlocked and the answer tray offers "View solution".
  - The answer tray shows the required kind, the current selection, and for `set` the "n of N selected" count. For `sequence`, an ordered list with drag to reorder. Signed out, it says "Anyone can read this puzzle. Sign in to submit an answer." before Submit is pressed.
  - Go-to-definition (F12 / ctrl-click, cmd-click on macOS), find references, and a breadcrumb trail of visited files.
  - Repo name, SHA, license, and link back to GitHub at that SHA.
- **Result:** correct / incorrect with a ✓ or ✗ icon, attempt count. Solution unlocks on a correct answer.
- **Profile (`/profile`):** private to the signed-in user, rendered per request and marked `noindex`. Signed out, it explains what it shows and offers sign-in. All data comes from `web/lib/server/profile.ts`, scoped to the user's id, and counts only published puzzles.
  - **Identity and summary:** one card. The display name the user set, or the login, then the login, pronouns and bio, their links, an "Edit profile" link, the Theme button, "GitHub account" with a link to their GitHub page or "Local development account", the member-since date, and "Browse puzzles". The avatar is the user's own picture or the default silhouette, never GitHub's. It never shows an email address or birthday. Below, lifetime figures divided by rules: **Solved** (distinct puzzles with status solved), **Attempted** (distinct puzzles with any graded submission, solved ones included), **In progress** (attempted, not solved), **Completion** (solved / published puzzles available now, rounded down, with "n of N available puzzles solved"), and, quieter, **Submissions** (every graded submission, repeats included; never called puzzles).
  - **Activity** (`components/profile/ActivityTracker.tsx`, full width): a GitHub-style calendar of UTC dates, Sunday at the top, oldest week on the left.
    - Period: "Last 365 days" (the default: today and the 364 dates before it), or any calendar year from the start of the user's history through this year (365 or 366 dates). Changing it reloads the calendar and the first-solve chart through `/api/me/activity`; the shown period stays until the new one arrives, and a failed load says so and offers Try again.
    - Activity on a date is the graded submissions to published puzzles made that UTC date, right or wrong. Repeats count as submissions; they never change puzzle counts. Page views, opening files, signing in and browsing don't count. It's codebases activity only, with no GitHub data.
    - Shades: a neutral zero and four blues from the accent, for 0, 1, 2–3, 4–6 and 7 or more submissions, with a Less–More legend. A date before the history starts (the account's creation date, or an earlier submission's), or after today, is hatched "No record", not shown as zero. Padding before the period's first date and after its last isn't a date at all. Today has a dark ring.
    - Each date's accessible name and the detail line under the grid read like "November 6, 2026: 3 submissions, 1 correct." (or "no submissions."). The grid is an ARIA grid with one Tab stop: arrows move by a day (up and down) or a week (left and right), Home and End go to the period's ends. Hover, focus or tap shows the detail; Enter, Space, click or tap picks the date, which filters Recent submissions to it, with "Clear date" in both places. A "Show active days as a table" table carries the same data.
    - On a narrow screen only the calendar scrolls sideways, opened at the newest dates, with the weekday labels pinned.
    - Streaks, above the grid, are lifetime and don't change with the period: **Current streak** is the run of consecutive active UTC dates ending today, or ending yesterday if today has none yet, otherwise 0; **Longest streak** is the longest run in the whole history. Also shown: active days in the period, submissions today, and "Practiced today" or "No submissions today". No freezes, penalties, levels or notifications.
    - Today is the server's UTC date, the one boundary the calendar, its counts and the streaks all use. `time_on_puzzle_ms` is client-reported and isn't shown.
  - **Continue practicing:** up to 6 puzzles in progress, most recently submitted first, with type, difficulty, repository, attempts and last submission date. It says a puzzle opens fresh, since selections aren't saved. With none, it links to the puzzle list.
  - **Progress:** a small step chart, "Puzzles solved over time", of the running total of distinct puzzles first solved, over the calendar's period, starting from the number solved before it. Each puzzle with status solved counts once, on the UTC date of its first correct submission (or `progress.solved_at` if no correct submission is recorded), so the chart ends at the solved count. A sentence and a table say the same. It measures first solves, not speed or skill. Below it, progress by type, difficulty, repository and topic, each row a named progress bar with the counts in words and a link to the puzzle list filtered to that category. A puzzle counts under each of its topics, and the page says topic counts overlap.
  - **Recent submissions:** 10 at a time, newest first, with the puzzle, repository, Correct or Incorrect, and the time in UTC. Filters for type, difficulty, repository and result, plus the date picked in the calendar, run on the server over the whole history; changing one starts again from the first page, and a newer request always wins over an older one still running. "Load more" continues the same filtered list. Submitted answers are never shown.
  - **Settings:** a link to `/settings`, which now holds the account controls.
- **Settings (`/settings`):** private, `noindex`, sections Appearance, Profile (picture and details), Links, and Email and account (section 8). Signed out, it explains itself and offers sign-in.
  - **Account:** Sign out, the privacy and terms links, and, in a separate panel, "Delete account". Deleting takes two clicks: the first shows what will be lost, the second deletes. Cancel closes the warning. After deleting, the browser goes to `/` and drops cached pages.
- **Privacy policy (`/privacy`) and terms (`/terms`):** static pages linked from the landing page footer and Settings. They describe what the code actually stores. Each page's review state is in `web/lib/legal.ts` (`PAGES.<page>.reviewed` and its date), with `CONTACT` the address each page lists for questions. M7 approved both on 2026-11-05; the privacy policy changed with the settings work and is a draft again until M11. A page that isn't reviewed says it's a draft.

---


### Motion

Motion uses shared CSS tokens in `web/app/globals.css`: 150ms control feedback, 220ms panel/state feedback, 400ms progress changes, 8px entrance distance and 45ms stagger. Transform and opacity carry movement; color and border transitions communicate control state. No animation library or JavaScript render loop is needed.

- Landing hero and worked example enter once, with at most a 90ms stagger. Lower sections reveal once on viewport entry, but remain visible before JavaScript and if observers never call back. The observer disconnects on cleanup.
- Navigation, buttons, selections and pending states respond without shifting their targets. Difficulty-strip height stays fixed. Native collapsible groups remove closed content from keyboard navigation immediately, with a brief opening fade where supported.
- Profile identity and summary tiles have a short entrance stagger. Progress fills use `scaleX` and transition from prior displayed values when the DOM is retained; first mount starts at zero in browsers supporting `@starting-style`. Numbers and accessible progress values render immediately. History appends in place, announces one summary, keeps its button focused through loading/exhaustion, and aborts pending requests on unmount. Deletion keeps its two steps and transfers focus between Cancel and the initial control.
- The one bounce: when a correct result appears, its ✓ scales in with a single overshoot (to 1.2, 320ms, `motion-bounce`) inside a fixed 20px circle, so the result box, its text and the View solution button don't move. The result is keyed by attempt, so it plays once per new result. A wrong result's ✗ doesn't bounce. Nothing else bounces, loops or floats.
- Workspace selection feedback stays inside the answer tray; only new result messages move. Monaco, tree targets, editor tabs and splitters never translate or remount for animation. Submission begins immediately, rejects concurrent requests, cancels the client request on unmount, and does not show stale feedback when selection changes in flight. A graded attempt still updates progress. Solution fetching and server authorization stay unchanged.
- `prefers-reduced-motion` removes movement, stagger, the bounce and progress interpolation. Loading effects exist only with loading content. No permanent `will-change`, decorative loops or per-frame React updates.

`pnpm visual:review` uses the existing Playwright fixtures with a throwaway database, free localhost port, `.next-visual` build directory and separate test artifacts. It captures stable states with motion enabled at 375px, 768px and 1440px, plus a 1366×800 workspace. Focused tests separately exercise motion, reduction, interruption, fallback content, focus and overflow. Fonts, explicit content readiness and bounded animation-state checks precede captures. Solution bodies are masked; synthetic activity has no submitted answers. Screenshots require actual inspection, never automatic baseline approval. See `VISUAL_REVIEW.md`.

---

## 11. Non-goals for v1

- Bug-fix puzzles and any code execution, including Build puzzles (section 15 is their v2 plan)
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

- Should `location` answers be dropped entirely in favor of `symbol` + `choice`? Decide after authoring the first 30 puzzles.
- Show set counts on every `set` puzzle, or only on easy and medium?
- Time-based scoring, or solved/unsolved only?

---

## 14. Launch checklist

What's left before a public launch, as of 2026-11-06. When an item lands, mark it done here and add a DEVLOG entry. Items are numbered so PRs and DEVLOG entries can refer to them.

**Manual** items need a person with access to an account, a payment method, or a decision. A Claude session can't do them. When a task depends on one, Claude should tell the user exactly what to do, using the steps below, and stop rather than work around it. **Code** items are open for anyone to pick up.

### Critical path

1. ~~M2 database, M5 R2 bucket, first `upload-all`, M3 production OAuth app, M4 Vercel, first deploy~~ Done 2026-11-08 on `codespaceleetcode.vercel.app`. When M1 lands, move `BETTER_AUTH_URL`, the OAuth app's URLs, the R2 CORS origin and (optionally) an R2 custom domain to it.
2. ~~M8 branch protection~~ Done 2026-11-08. C3 shared rate limiting is done.
3. M6 human second solves before the site is announced publicly (section 6).
4. M10 email delivery and M11 privacy re-review before a public launch: without M10, production can't confirm contact emails.

### Manual: needs a person

| # | Task | Steps | Unblocks |
|---|---|---|---|
| M1 | **Register the production domain** | Pick and buy it. Every URL below says `<domain>`. | M3, M4, M5's custom domain |
| M2 | ~~**Create the hosted database**~~ **Done 2026-11-08.** | 1. Create a Supabase project. 2. Get two connection strings from Project Settings → Database. Use the Session pooler, not the direct connection, which is IPv6-only on the free plan. Percent-encode any `@ : / # ? [ ]` in the password. The **direct or session** one is for seeding and migrations, and goes in `ingest/.env` as `SUPABASE_DB_URL`. The **transaction pooler** one (port 6543) is for the app, and goes in Vercel as `DATABASE_URL`. 3. Apply the migrations with `cd ingest && uv run --env-file .env python -m ingest migrate` (try `--dry-run` first). Run it again after any new migration lands. Don't apply `supabase/local/shim.sql`: hosted Supabase already has those roles and the `auth` schema. 4. Seed with `uv run --env-file .env python -m ingest seed`, with the snapshots built (`snapshot-all`). The loaded content is about 340 MB, so the 500 MB free tier fits for now. | Deploy |
| M3 | ~~**Create the production GitHub OAuth app**~~ **Done 2026-11-08,** on `https://codespaceleetcode.vercel.app` until M1. | GitHub → Settings → Developer settings → OAuth Apps → New. Homepage `https://<domain>`, callback `https://<domain>/api/auth/callback/github`. Use an org account if the team has one, so it isn't tied to one person. Generate a client secret and put it straight into Vercel (M4). Never put it in git, a chat, or a terminal prompt. | Sign-in in production |
| M4 | ~~**Create the Vercel project**~~ **Done 2026-11-08.** Live at `https://codespaceleetcode.vercel.app`; it also needs `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pinned pnpm 12. | Import the GitHub repo. Root directory `web`, framework Next.js; pnpm is picked up from `packageManager`. Set these environment variables for Production: `DATABASE_URL` (M2's pooler URL); `BETTER_AUTH_SECRET`, a new one rather than the local one, made with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; `BETTER_AUTH_URL=https://<domain>`; `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (M3); and `NEXT_PUBLIC_SNAPSHOT_CDN_URL` (M5). `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing one. Then add the domain. | Deploy |
| M5 | ~~**Create the R2 bucket**~~ **Done 2026-11-08,** on its `r2.dev` URL until M1. | In Cloudflare, create an R2 bucket and give it public read access through a custom domain such as `cdn.<domain>` (`r2.dev` is fine for testing). Add a CORS rule allowing `GET` from `https://<domain>`, because the browser fetches the files directly. Create an API token with write access to that bucket only. Its values go in `ingest/.env` as `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_BUCKET`, and never anywhere under `web/`. The public bucket URL becomes `NEXT_PUBLIC_SNAPSHOT_CDN_URL`. Optionally, add a Cloudflare response header rule for the custom domain that sends `X-Content-Type-Options: nosniff`, as the app does. Then upload with `cd ingest && uv run --env-file .env python -m ingest upload-all` (`--dry-run` first), and again after any snapshot is rebuilt. | M4 |
| M6 | **Human blind second solves** | Every puzzle needs a person in `verified_by` (section 6). **Don't solve a puzzle you wrote, or one whose YAML or solution you've read.** 1. `cd ingest && uv run python -m ingest blind-export --out ../blind.json --repo <slug>` exports only what a solver may see. 2. Solve each puzzle in the local site or from the export, and write your answers as a JSON map of puzzle id to submission, such as `{"<puzzle-id>": {"kind": "symbol", "id": "src/app.ts#App.handle"}}`. The other kinds are `{"kind": "file", "path": ...}`, `{"kind": "location", "id": "path:L10-L14"}`, `{"kind": "sequence" or "set", "ids": [...]}` and `{"kind": "choice", "option": "b"}`. 3. `uv run python -m ingest blind-check <answers.json> --solver <your-name> --write` grades it, printing pass or fail only, and adds you to `verified_by` for each pass. You get one graded attempt per puzzle version. 4. A fail means the key is wrong or the prompt allows another answer. Report it to the author; don't retry. 5. Commit the YAML changes and `content/blind-attempts.json`. Don't commit `blind.json` or your answers. | Public launch |
| M7 | ~~**Review the legal pages**~~ **Done 2026-11-05.** | C6 drafted `/privacy` and `/terms` from what the code stores. Someone accountable reads and approves them, and decides anything they leave open, such as a governing law. Then in `web/lib/legal.ts` set each page's `reviewed` to true (which removes the draft notice) and its date, and set `CONTACT` to a real address. | Public launch |
| M8 | ~~**Protect `main`**~~ **Done 2026-11-08.** Pull request required (no approval count, since the team is small), the five checks required and up to date, no force pushes or deletion. Admins can still bypass in an emergency. | In GitHub → Settings → Branches, add a rule for `main` that requires a pull request and these CI checks from `.github/workflows/ci.yml`: "Web lint, typecheck and unit tests", "Ingest ruff, pyright and tests", "Content validation", "End-to-end (Playwright, next dev)" and "Production smoke test (next build, next start)". | Safe collaboration |
| M10 | **Set up email delivery** | Contact email confirmation needs it in production. 1. Create a Resend account (or change `web/lib/server/email-delivery.ts` for another provider). 2. Verify a sending domain, such as `mail.<domain>`, by adding the DNS records Resend gives you (SPF, DKIM). 3. Create an API key with sending access only. 4. In Vercel, set `RESEND_API_KEY` and `EMAIL_FROM` (for example `codebases <noreply@mail.<domain>>`) for Production, then redeploy. Never paste the key into git, a chat or a terminal. Until this is done, production Settings says email can't be sent. | Contact email in production |
| M11 | **Re-review the privacy policy** | The settings work changed `/privacy`: contact email (and Resend as the provider that sends it), profile details, links, birthday, picture, theme preference and browser storage, and deletion now lives in Settings. On 2026-11-08 the page was rewritten in full to match the code: what GitHub shares at sign-in (the email addresses are read and not stored), legal bases, a retention table, every cookie and storage key, providers, security, rights, children and changes. Used email links and expired sessions are deliberately kept until account deletion, as the page says (decided 2026-11-08). The reviewer should also decide whether the page names the operator. Someone accountable reads the new text and, if it's right, sets `PAGES.privacy.reviewed` to true and its `lastUpdated` in `web/lib/legal.ts`. The draft notice shows until then. | Public launch |
| M9 | **Pick an error-monitoring service** | For C8. Create the account, for example Sentry, and get its DSN. | C8 |

**Per-developer setup (manual, each teammate once).** Follow `README.md`: Node 22 or 24, pnpm, uv, the SCIP indexers, then `snapshot-all`. To use GitHub sign-in locally, each developer creates their **own** OAuth app with the callback `http://127.0.0.1:3000/api/auth/callback/github`, and puts the four values in their own `web/.env.local` (README, "GitHub sign-in"). Don't share one secret between developers. Without that file, GitHub sign-in is off and the localhost dev login still works.

**Handling secrets.** Secrets go only in `web/.env.local`, `ingest/.env`, or the Vercel and Cloudflare dashboards, and git ignores `.env*` except `.env.example`. Never paste one into a terminal prompt, a chat, an issue or a PR. If one leaks, regenerate it at the source first, then update where it's stored.

### Code: open for anyone

| # | Task | Done when | Needs |
|---|---|---|---|
| C1 | ~~**CI on GitHub Actions**~~ **Done 2026-11-05.** | Every PR runs web lint, typecheck and tests (against a Postgres service container via `TEST_DATABASE_URL`), ingest tests (`INGEST_TEST_DB_URL`), `ruff` and `pyright`, `pnpm validate`, and `pnpm e2e`. `validate` needs the snapshots, so CI builds them with the pinned indexers or restores them from a cache keyed on `content/repos.yaml` and the pipeline's source. Also runs `pnpm smoke` (C9). The workflow is `.github/workflows/ci.yml`. | None |
| C2 | ~~**Snapshot upload to R2**~~ **Done 2026-11-05.** | `uv run python -m ingest upload <slug>` (and an `upload-all`) puts `manifest.json` and `files/...` at `snapshots/<slug>@<sha>/` in the bucket, matching what `web/lib/client/snapshot-urls.ts` fetches. It sets content types, skips files already there with the same hash, and never deletes. Unit-tested with a fake S3 client. Credentials come from `ingest/.env` only (`ingest/tests/test_env_split.py` keeps them out of `web/`). Files go up before the manifest, so a manifest never names a missing file. Skipping compares each file's MD5 with R2's ETag. | M5 for a real upload |
| C3 | ~~**Shared rate limiting**~~ **Done 2026-11-05.** | Submit and search limits are kept in Postgres (or Redis), not process memory, so they hold across serverless instances. A new table follows the RLS rule in section 8. Better Auth's own limiter is pointed at the same store (`rateLimit.customStorage`). Built as migration 0006 and `web/lib/server/rate-limit.ts`. | None |
| C4 | ~~**Security headers**~~ **Done 2026-11-05.** | `next.config.ts` sends a Content Security Policy, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors`. The CSP allows Monaco's workers, mermaid's inline SVG styles, and the snapshot CDN origin in `connect-src`. The e2e suite still passes with it on. See section 8, "Security headers". | None |
| C5 | ~~**Search and sharing metadata**~~ **Done 2026-11-05.** | `robots.txt`, a sitemap of `/`, `/puzzles` and the puzzle pages, and a social preview image for the landing page. URLs are absolute on `BETTER_AUTH_URL`'s origin, so they follow the domain once M1 and M4 set it. | None now |
| C6 | ~~**Privacy policy, terms, account deletion**~~ **Done 2026-11-05.** | Static pages linked from the footer, and a way for a user to delete their account. Deleting an `auth_users` row cascades to `users`, submissions and progress. Better Auth's `/delete-user` stays in `disabledPaths`; deletion is our own `DELETE /api/me`. M7 approved the pages. | M7 (done) |
| C7 | ~~**Hosted migration runner**~~ **Done 2026-11-05.** | A script that applies `supabase/migrations` to `SUPABASE_DB_URL` in order, with a tracking table, like `scripts/localdb.mjs migrate` does locally. This makes M2 repeatable. Built as `python -m ingest migrate` (section 8). | None |
| C8 | **Error monitoring** | Server and client errors reach the service, with no answer data or secrets in the payloads (rule 1). | M9 |
| C9 | ~~**Production smoke test**~~ **Done 2026-11-05.** | A Playwright run against `next build && next start`, checking the landing page, the puzzle list, a puzzle page with code loaded from the CDN, and that `/api/dev/*` returns 404. The dev login is refused in production, so signed-in flows stay in the dev e2e suite. Run with `pnpm smoke`; a small local server stands in for the CDN on another origin. | None |

### Known issues (DEVLOG has the details)

- A user stays `solved` if a puzzle's key later changes.
- If a GitHub login is freed by a rename and someone else then takes that name, the new owner stays signed out until the old holder signs in again.
- `hono-architecture-001`'s solution points at `hono-find-003`'s answer file. Fixing it needs a different scenario for one of the two puzzles.
- Rich doesn't fit the 18 topics well.

---

## 15. v2 plan: Build puzzles

Not part of v1, and nothing here is built yet. Building any of it needs the decisions under "Open decisions" first, then changes to CLAUDE.md rules 2, 3 and 8 and to section 11, made in the same change that adds the first piece.

### What a Build puzzle is

The practical coding round some companies run: build a small working system from a written spec, in about 60 to 90 minutes, with the requirements arriving in levels. Each level builds on the code from the one before, so a design that was quick but messy gets harder to extend. Examples:

- **In-memory database.** Level 1: `set`, `get` and `delete` on records with fields. Level 2: scan a record's fields, and filter them by prefix. Level 3: timestamps and TTL, so a field can expire. Level 4: backups and restores to an earlier point in time.
- **Bank system.** Accounts, deposits and transfers; then ranking accounts by activity; then scheduled payments; then merging accounts.
- **File storage.** Add, copy and get file sizes; then listing by prefix and largest files; then per-user quotas; then backup and restore.
- **Rate limiter, LRU cache with TTL, task scheduler, simple order book.**

A Build puzzle isn't set in a snapshot. It may name a real repository as further reading, for example a Design puzzle on the same system, and its solution may compare the reference solution with that repository's code.

### How it works

- **One fixed interface.** Each puzzle ships a starter file per language that declares a class and its method signatures, such as `InMemoryDB.set(timestamp, key, field, value)`. Tests call only that interface. Time is always a parameter, never the clock, so every test is deterministic.
- **Levels unlock in order.** Level n + 1's spec is shown once level n passes. The user keeps one file and edits it.
- **Run and submit.** "Run" runs the level's sample tests, which the user can read. "Submit" runs that level's hidden tests too, and the level passes only when all of them pass. A run reports how many tests passed and, for sample tests only, the expected and actual values. A hidden test's inputs are never shown, just as an answer key never is.
- **Grading stays objective.** Tests compare return values exactly. No LLM grading, no style scoring, and no credit inside a level. A puzzle's score is the number of levels passed.
- **Languages.** Python and TypeScript first, the two the site already covers.

### Running untrusted code

This is the reason Build isn't in v1. Users' code never runs on Vercel or on the database host.

- **A separate sandbox service** runs each submission in a fresh, disposable microVM or gVisor container: either a hosted service (such as E2B, Modal sandboxes or a hosted Judge0) or a self-hosted runner on its own machine. Recommendation: start with a hosted microVM service, because it needs no machine to maintain, and keep the interface narrow (code, language, tests in; results out) so the provider can change.
- **Limits per run:** no network, a read-only filesystem except a small temporary directory, an unprivileged user, 256 MB of memory, 10 seconds of CPU per level, 64 KB of output, and 64 KB of source. A run that hits a limit fails with that limit named.
- **The test runner is ours.** It loads the user's file as a module, calls the interface, and reports results as structured data. Nothing the user's code prints can be mistaken for a result.
- **Abuse.** Running needs sign-in. Runs are rate-limited in `rate_limits` (for example 10 a minute and 200 a day per user), and the sandbox call has its own timeout, so a stuck provider can't hold a serverless function open.

### Data and content

- `content/build/<id>/`: `puzzle.yaml` (title, difficulty, tags, languages, level count), `levels/<n>.md`, `starter/<lang>/`, `tests/<lang>/level_<n>_{sample,hidden}.*`, `reference/<lang>/` and `solution.md`.
- New tables, following the RLS rule in section 8: `build_levels (puzzle_id, level, spec_md, sample_tests)` readable by the server only, and `build_runs (id, user_id, puzzle_id, level, language, source, passed, tests_passed, tests_total, duration_ms, created_at)`. Hidden tests and reference solutions are answer data under rule 1: they stay server-side like `answer_json`. A user's source is theirs: it's shown only to them, and deleted with the account. The privacy policy has to say so before launch.
- **Validator checks for Build:** the reference solution passes every level in every language, and the reference for level n alone fails level n + 1, so each level asks for something new; an empty starter file fails every level; each test passes three runs in a row with the reference; each level has at least one sample and five hidden tests; the starter and the tests use the same interface.
- Blind second solves still apply: a second person or agent builds the system from the specs alone, and their solution must pass. A level whose spec allowed two readings gets its spec fixed, never its tests loosened.

### UI

An editable Monaco editor with the starter file, the level spec beside it, level tabs locked until the earlier ones pass, Run and Submit, and per-test results. An optional timer counts the elapsed time but never stops the user. The workspace keeps its laptop-size minimum.

### Work items

| # | Task | Kind |
|---|---|---|
| B1 | Choose the sandbox provider, create the account and its billing, and decide the languages. | Manual |
| B2 | A server-only runner client in `web/lib/server/` that calls the sandbox with limits and a timeout, with tests against a fake sandbox. | Code |
| B3 | The test-runner harness per language, which loads user code and reports structured results. | Code |
| B4 | The migration for `build_levels` and `build_runs`, with RLS and account deletion covering `build_runs`. | Code |
| B5 | The content format, the validator checks above, and `ingest seed` support. | Code |
| B6 | The editor workspace and level flow. | Code |
| B7 | The first three puzzles: an in-memory database, a bank system and a file storage system, each with four levels. | Code |
| B8 | Review the privacy policy and terms for stored source code and the sandbox provider. | Manual |

### Open decisions

- Which sandbox provider, and what it may cost per month at the expected number of runs.
- Whether Build puzzles are free for everyone or need a limit per day.
- Whether to show sample test failures only, or also the name of each failing hidden test (more helpful, but it leaks part of the key).
- Whether a Build puzzle can be timed as a mock interview, and whether its time is shown on the profile.
