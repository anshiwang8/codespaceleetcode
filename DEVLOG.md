# DEVLOG

## Hardening from the repo audit

Type: Fix, Removal

Goal: Fix the low-severity findings from the repo audit: rate-limit gaps, error handling, blind-solve integrity, input checks on `repos.yaml`, and missing tests.

What should be done: Fix each one with a test that fails before the fix, and measure before changing anything on cost grounds.

What was done (technical):

- **Rate limits.** Signed-out search was keyed on the first `X-Forwarded-For` entry, which the client writes, so each request could pick a fresh bucket. It now uses the last entry, which the nearest proxy appends; Vercel sends one entry, so it's the same there. A rare two-letter query took about 400 ms on fastapi's 20 MB snapshot, since the trigram index needs 3 characters, against about 15 ms for a rare 4-letter one. Queries under 3 characters now also count against a limit of 30 a minute. Search is debounced, so a person sends about one per word.
- **`withTransaction`.** A failed rollback replaced the real error and returned a broken connection to the pool. The real error is now rethrown and the connection destroyed, tested with a fake pool.
- **`readJson`.** A chunked body has no `Content-Length`, so the whole body was read before the size check, and the check counted UTF-16 characters, not bytes. It now counts bytes as they arrive and stops past 256 KB.
- **Sequence removal.** The audit said a `remove` without a `key` removed every item; it actually removed none. No caller did it, but the type allowed it. `remove` (by ID, for sets) and `remove-item` (by key, for sequences) are now separate actions, so it can't be written.
- **Blind solves.** `blind-check` printed pass or fail on every run, so a solver could guess until it passed, and a choice puzzle has 3 to 5 options. Each solver now gets one graded attempt per puzzle version, kept in `content/blind-attempts.json`. A rerun repeats the first result, so `--write` still works after a check without it. The version is a hash of the exported puzzle, not the key, since a hash of a choice ID could be reversed by trying each one. The validator has a new check, `verifier-not-author`, and `blind-check` uses the same name rule: `agent:` stripped and case ignored.
- **`repos.yaml`.** Duplicate slugs and anything but a plain `https://` URL are refused. The URL goes to `git fetch`, where `ext::` and `file://` run or read locally, and into the attribution link on every puzzle page, where `javascript:` would run.
- **Indexer safety on macOS and Linux.** `stage_files` doesn't copy permissions, so staged files are never executable; a test now locks that in. As a second layer, `run_tool` drops relative `PATH` entries, since an empty entry or `.` means the stage dir, where npm's `#!/usr/bin/env node` would find a repo's `node`. The test shows the attack working without the protection. Rebuilt `psf-requests` and `h3js-h3` snapshots are byte-identical.
- **Tests.** The R2 leak scan now reads `.env`, `.env.local` and the like, which it skipped because their suffix isn't a code suffix. Grading cases for a wrong file, a different symbol, an extra sequence element and a repeated one are in `grading-cases.json`; both graders already passed them.
- **Removed** the unused `ingest/validate.py`. Error hints now say `uv run python -m ingest` or `pnpm validate`.
- The `agent-only-note` e2e flake read the note straight after a navigation without `visible()`, which `helpers.ts` says to use there. It passed 24 times in 24 after the change.
- 485 ingest tests (1 Windows-only skip), 478 web tests against real Postgres and 54 Playwright tests pass, e2e twice in a row. All 85 puzzles validate.

Still open:

- Earlier blind solves weren't recorded in the ledger, so it starts empty.
- With no proxy in front, as on localhost, every signed-out client shares the `ip:unknown` bucket. Production needs a proxy that sets `X-Forwarded-For`, which Vercel does.

## Close three open items: the reference cap, unknown puzzles, LOCALDB_PORT

Type: Fix

Goal: Close three "Still open" items from the MVP review: find references could be cut short without saying so, unknown puzzle URLs returned HTTP 200, and `pnpm dev` ignored `LOCALDB_PORT`.

What should be done: Fix each one with a test that fails before the fix, and update the spec's API section.

What was done (technical):

- **The reference cap is explicit.** `/api/snapshots/:id/symbols` asks for 501 references, returns at most 500, and sets `referencesTruncated` when there were more, the way search does. The UI used to guess from the list length, so a symbol with exactly 500 references showed "first 500". Unit tests cover 501+ and exactly 500, and two e2e tests check the label both ways.
- **Unknown puzzles are a 404.** The root `loading.tsx` wrapped every page, so streaming began before the puzzle page could call `notFound()`. The list page and its `loading.tsx` moved into the `app/(list)` route group, and the new `app/puzzles/[slug]/layout.tsx` looks the puzzle up before the puzzle's own `loading.tsx` streams. The layout, metadata and page share one lookup through `web/lib/server/puzzle-page.ts`, which uses React's `cache`. The e2e test now asserts 404 for a missing slug and a malformed one, and 200 for a real puzzle.
- **`LOCALDB_PORT` is honoured everywhere.** `web/lib/server/db.ts`, `web/tests/global-setup.ts` and `ingest seed` now use it as `scripts/localdb.mjs` does, and reject a value that isn't a port. An empty value means the default in the scripts too, rather than port 0.
- **Two e2e races were exposed, both in the tests.** They showed up because the route change shifted page timing. A run of the same tests on the Phase 2 commit, and on that commit plus only the route move, showed the move was the trigger.
  - `clickToken` measured a line Monaco had just replaced, because re-rendering detaches a line's elements. The rectangle came back as 0,0, so the test clicked the header. It now measures again when the line is detached or has no size. The F12 test went from 10 failures in 48 to 32 passes in 32.
  - The file-retry test failed exactly one request. When the viewer mounted just as the file was clicked, development's strict mode loaded the file twice: the first load got the 500 and was thrown away, and the second succeeded, so no error showed. The test now fails every request until it clicks "Try again", like the manifest test beside it. Production mounts once, so this was never visible to users. 48 passes in 48, from 3 failures in 24.
- 452 ingest tests (1 Windows-only skip), 464 web tests against real Postgres and 54 Playwright tests pass, twice in a row for e2e. All 85 puzzles validate.

This closes "`LOCALDB_PORT` is only honoured by the scripts", "The `/symbols` route caps references at 500 with no `truncated` flag" and "Unknown puzzle URLs return HTTP 200". The detached-line race in `clickToken` probably also explains the `cursor-symbol` timeouts in the entry below, though those runs weren't traced.

Still open:

- "creates one user from concurrent first logins" timed out at 5 seconds twice in five full web runs right after a restart, while the 15-minute load average was above 20. It passed 10 times in 10 once the load dropped. This change doesn't touch dev login.

## Correctness fixes from the repo audit

Type: Fix

Goal: Fix the bugs a full audit of the repo found, each of which could give wrong data or hide something from the user without saying so.

What should be done: Fix each one with a test that fails before the fix, without weakening any validator check.

What was done (technical):

- **Seeding could empty the site.** A content folder with no `puzzles/` passed validation with 0 puzzles, and seeding then treated every puzzle as removed: it deleted the untried ones and unpublished the rest. `validate_content` now fails when it finds no puzzles.
- **symbol-unique switched itself off.** If a prompt mentioned the answer's own file anywhere, only that file was checked, even when the prompt also named a wider directory. Spec section 6 says the widest scope wins. The directory now takes precedence, with a must-fail fixture. All 85 puzzles still pass.
- **Override reasons were printed.** They're author prose and can name the answer (`ajv-trace-001`'s does), so CI logs could carry it. Only the check name is printed now.
- **Rebuilt snapshots kept a stale cache.** `/snapshots/...` sent `immutable` for a year, but a rebuilt snapshot keeps its name. It now sends `public, no-cache` with a SHA-256 ETag and answers a match with 304.
- **Seeding missed changed file bytes.** The snapshot hash covered the manifest, which records only sizes, so an edit at the same size never reloaded without `--force`. The hash now covers every file's bytes. Re-seeding 15 snapshots takes about 3 seconds; the first run after this change reloads them all once.
- **A result could vanish.** Submitting before `/api/me` answered stored the result under no login, so it was never shown. Submit stays disabled until the page knows who's signed in, with an e2e test that holds `/api/me` back.
- **A changed key left stale progress.** When seeding changes a puzzle's answer key, it now regrades that puzzle's stored submissions with the Python grader and recomputes each user's status and solve time. Each submission keeps its recorded `correct`, which says how it was graded at the time. This closes the open "a user stays `solved` if a puzzle's key later changes".

Still open:

- Under heavy machine load, e2e tests waiting on `cursor-symbol` can time out at 15 seconds, and `agent-only-note` once matched two elements. All passed on a rerun, and with this change and without.

## Run on macOS, and remove giving up

Type: Fix, Removal

Goal: Make the project install, run and test on macOS, since it had only ever run on Windows. Then remove the give-up feature.

What should be done: Fix whatever stops a fresh macOS clone from working, run every suite there, and take giving up out of the site, the API, the database and the docs.

What was done (technical):

- **`pnpm install` failed on macOS.** `pnpm-workspace.yaml`'s `allowBuilds` listed only the Windows `embedded-postgres` package, and pnpm refuses an unlisted build. The macOS and Linux packages are now `true`, because their install script links Postgres's libraries.
- **`README.md` was UTF-16,** so git showed it as binary and plain `grep` found nothing in it. It's UTF-8 now, with macOS install steps for uv and pnpm. The install hints in `scripts/local.mjs` and `fetch.py` no longer give only `winget`. Node is documented as 22 or newer, with `engines` in `package.json`, since everything ran on Node 26.
- **Ctrl+C.** `scripts/local.mjs` starts pnpm without a shell everywhere except Windows, so a signal reaches pnpm. `localdb.mjs` exits cleanly if Postgres already got the signal itself. `scripts/e2e.mjs` now cleans up on Ctrl+C; before, the temp database folder and `.next-e2e` were left behind. Sending Ctrl+C's signal to a running `pnpm local` and to an e2e run left no process, temp folder or build behind.
- The go-to-definition tooltip and spec say cmd-click on macOS. The e2e test stays on Ctrl, with a comment saying why: Playwright's Desktop Chrome profile reports a Windows user agent.
- `.DS_Store` is ignored at the root.
- On macOS (Apple silicon, Node 26) all 15 snapshots built, all 85 puzzles pass `pnpm validate`, and the whole seed took under a minute. 421 ingest tests, 27 seed tests, 457 web tests against real Postgres, and 51 Playwright tests pass.
- **Giving up is gone.** The button, `POST /api/puzzles/:slug/give-up`, `GiveUpResponse` and the `given_up` status are removed. A solution unlocks only after a correct answer. Migration `0003_remove_give_up.sql` turns earlier give-ups into `attempted`, limits `progress.status` to `attempted` and `solved`, and drops `progress.gave_up`. The e2e test that checked solution rendering through giving up now gets there by solving. New tests check that the route is gone and that the database rejects `given_up`.

Still open:

- Snapshots built on macOS weren't compared byte for byte with Windows builds. macOS and Windows both ignore filename case, so neither stands in for a Linux CI build.
- Anyone who gave up earlier is now `attempted`, so they can still solve the puzzle after seeing its solution.

## Review fixes before merging the MVP

Type: Fix

Goal: Act on two independent reviews before merging to main: one attacking the code and the rules, one checking answer keys against the code.

What should be done: Fix what they found without weakening any rule, and record what's still open.

What was done (technical):

- **A repo could run code on Windows.** The npm `.cmd` shims run a bare `node`, and `cmd.exe` looks in the current directory first, so a `node.cmd` in a repo would have run during indexing. None of the 15 has one. `run_tool` now sets `NoDefaultCurrentDirectoryInExePath`, and Windows executables are no longer copied to the stage folder. A test proves the attack works without the protection and fails with it.
- **Rebuilt snapshots never reached the database,** so correct answers were rejected as not in the snapshot. Seeding now compares a `content_hash` (migration 0002) and reloads when it differs.
- **Database failures printed only `undefined`.** They now name the port and show Postgres's last log lines.
- **`pnpm local` printed the wrong address** when port 3000 was busy. It now uses `PORT` strictly and fails rather than moving. It also applies migrations to a database it finds already running.
- **Rule 1 tests skipped silently with no database, and the run still passed.** They now fail unless `ALLOW_NO_DB=1` is set.
- Dev login now refuses requests from other local ports, so another local app can't act on your session. The graders now agree on absurd locations, with cases added to the shared table. A NUL in a page filter is ignored.
- `python -m ingest` replaces the generated launcher everywhere, because Windows Application Control can block generated `.exe` files.
- Answer-key audit of 76 of the 85 puzzles: no wrong keys. It caught three solutions naming stale option letters and five lowercase sentence starts, both from my own bulk edits, plus three ambiguous prompts and three that gave their answer away. Those were rewritten and re-solved. Twelve puzzles were relabelled to their real difficulty. A re-solve then caught that my rewrite of `nest-find-001` allowed a second answer, so it was tightened and solved again.

Still open:

- Blindness of the second solves can't be independently confirmed, and author and solver are similar models. The key audit is the stronger evidence, and it didn't cover the 9 `file` puzzles.
- `LOCALDB_PORT` is only honoured by the scripts, so `pnpm db` on another port needs a matching `DATABASE_URL` for `pnpm dev`.
- A user stays `solved` if a puzzle's key later changes.
- The `/symbols` route caps references at 500 with no `truncated` flag. The UI infers it from the list length; 149 symbols exceed it.
- Unknown puzzle URLs return HTTP 200 with a not-found page, because `loading.tsx` starts streaming first.
- Ctrl+C in a Git Bash window hasn't been tried by hand. It was confirmed in a Windows console.

## Puzzle viewer and 85 puzzles

Type: Addition

Goal: A site you can actually use: browse puzzles, read real code in an IDE, select an answer, get graded, read the solution.

What should be done: Build spec section 10, write and verify puzzles for all 15 repos, and test it end to end.

What was done (technical):

- Puzzle list with URL filters, three-panel puzzle page, Monaco bundled locally with no CDN, go-to-definition, find references and hover from the index, search, outline, answer tray for all six kinds, hints, give-up, solutions, profile, and dark and light themes.
- Monaco is imported without its language services, so every definition and reference comes from the index (rule 7). Prompts, hints and solutions render as markdown with raw HTML dropped.
- `pnpm e2e` runs 52 Playwright tests with its own database and server, from a cold build each time, since reusing a build left the page reloading forever on alternating runs.
- Real data exposed a bug where find references silently dropped results: nest's `Injectable` showed 159 of 873.
- 85 puzzles across 15 repos, 4 to 6 each, covering all three types and six answer kinds. All pass `pnpm validate` and a blind solve by a separate agent, recorded as `agent:<name>`. `b` was the correct option on 10 of 15 `choice` puzzles, so people could guess, and correct options are now spread evenly.

## Fifteen repos, Python indexing and one-command start

Type: Addition

Goal: Have real content to test: 15 repos across TypeScript and Python, loaded and running with one command.

What should be done: Support Python, choose 15 repos that meet spec section 5 and index well, and make the site start with `pnpm local`.

What was done (technical):

- Ten TypeScript repos: hono, vue, nest, zod, rxjs, mobx, redux-toolkit, ajv, got, h3. Five Python: requests, flask, click, httpx, fastapi. Each has 6k to 65k lines of non-test source, and hundreds of call edges in it.
- `uv run ingest snapshot-all` builds them all and prints a table. Each snapshot gets a `summary.json`, and `occurrences.jsonl` now has `end_col`.
- Real bugs fixed, all of which failed silently or gave wrong data: scip-python crashed on load on Windows (a preload shim fixes it) and a forward-slash `--cwd` gave an empty index. Pyright read our own `pyproject.toml` by walking up the tree. Absolute imports under `src/` never matched their definitions. `@overload`s and property setters were reported as references. Decorators, annotations and base classes counted as calls. Forcing `bundler` module resolution took Nest from 0 to 1,015 cross-package edges.
- `pnpm local` starts the database, loads content, and runs the site. On a clean database it loaded 11,860 files, 57,886 symbols and 717,816 occurrences in under 20 seconds.
- Spot-checking 600 random functions and methods across the 15 repos, 590 had their name within the first lines of their stated range. None of the 429 in `fastapi/` itself missed, so its misses are outside its source, such as docs and tests. I didn't look into the misses in the other three Python repos. No snapshot has a dangling edge.

Known gaps:

- TypeScript object-literal members and functions wrapped in a call (`const x = wrap(() => ...)`) get no ID, and calls inside them give no edges. Redux Toolkit is the thinnest for its size, probably because of this, though that's not confirmed.
- scip-python can't give an ID to a class shadowing a builtin, such as `requests.exceptions.ConnectionError`. Attributes in `__slots__` classes add a few false edges.
- Python is indexed as if on Linux, so results are the same on any machine, which leaves Windows-only code without IDs.
- Indexing has only been run on Windows.

Decisions: Express is out, and vitest was rejected because scip-typescript emits a malformed symbol from one of its test fixtures. TypeScript object-literal members stay without IDs, because recovering them would widen the exception to rule 7.

## Puzzle schema, validator, seed and blind-solve tools

Type: Addition

Goal: Stop a puzzle shipping unless it's provably checkable, and load everything into Postgres.

What should be done: Implement every check in spec section 6, the `ingest seed` command, and tools that let a solver answer without seeing a key.

What was done (technical):

- `content/schema/puzzle.schema.json` and `uv run ingest validate` cover the schema, existence and uniqueness checks. Error messages name fields, never values.
- `uv run ingest seed` validates first, skips snapshots already loaded, and upserts puzzles so users keep their progress. 15 synthetic repos of 100k lines took 70 seconds to load and 1.1 seconds to re-seed.
- `blind-export` writes only what a solver may see, with a test that fails if any answer value appears. `blind-check` prints pass or fail only, and won't record a solver who is also the puzzle's author.
- Breaking 18 critical behaviours one at a time, the tests caught all 18.

Fixes after review:

- The Python grader ignored duplicate set members while the web grader rejected them, so a blind solve could pass something the site would mark wrong. Both now reject them, and both test suites run `content/schema/grading-cases.json`.
- `set-count`, `location-window` and `choice-options` can no longer be overridden, since a hand-edited `verified_by` could otherwise publish an unsolvable puzzle.
- Windows made the local database WIN1252, which can't hold every character in real repos. `scripts/localdb.mjs` now forces UTF-8.

## Grader, API routes and dev login

Type: Addition

Goal: Grade answers on the server and give the UI everything in spec section 9, without an answer key ever reaching a client.

What should be done: Build the grader, every API route, the localhost dev login and the route standing in for the CDN, with tests that actively look for leaks.

What was done (technical):

- `web/lib/server/grader.ts` compares IDs exactly for all six answer kinds. Only `submit.ts` reads `answer_json`, and a test enforces that.
- Dev login is refused unless `NODE_ENV` isn't production and the Host, `X-Forwarded-Host` and `Origin` are all local. `pnpm dev` binds to `127.0.0.1`, since a server on all interfaces would let someone on the same network spoof the Host header.
- `/snapshots/<name>/...` serves only `manifest.json` and `files/<path>`, as plain text with `nosniff`. About 20 traversal forms were refused against a running server. A build trace showed its dynamic paths pulling the whole project, including solutions, into the server output; `turbopackIgnore` fixed that.
- 406 web tests run against real Postgres. Breaking 39 protections one at a time, the suite caught all 39.
- Rate limits are in memory and per process: 60 submits and 240 searches a minute. They'd need a shared store before a real deployment.

## Contracts for the localhost MVP

Type: Addition

Goal: Let several agents build the site at once and have the parts fit, with no accounts or API keys needed to run it on localhost.

What should be done: Fix the database schema, API shapes and local stand-ins before any feature work starts, and record them in the spec.

What was done (technical):

- `supabase/migrations/0001_init.sql` implements spec section 8. It adds `snapshots.name`, `occurrences.end_col`, `puzzles.choices` and `puzzles.verified_by`. RLS plus column grants deny clients `answer_json` and `solutions`, confirmed by querying as the `anon` role.
- `scripts/localdb.mjs` runs real Postgres 18 from the `embedded-postgres` npm package, with data in `.localdb/`. No Docker or install needed. `pg_trgm`, roles and RLS all work on Windows. `supabase/local/shim.sql` adds the roles and `auth` schema Supabase provides, so the same migrations run in both places.
- `web/lib/api-types.ts` holds the API shapes. Spec section 9 lists the routes, including the localhost-only `/api/dev/*` and `/snapshots/*`.
- `INGEST_OUT_DIR` and `INGEST_WORK_DIR` let git worktrees share one set of fetched repos and snapshots.

Decisions:

- Localhost mode covers TypeScript, JavaScript and Python. Go isn't installed here and its installer may need admin rights, so it's left for later.
- Express is dropped from the launch repos: it's under the 5k-line minimum and its index leaves most calls unresolved.
- GitHub OAuth, R2 upload and deployment aren't being built yet, because they can't be tested without accounts. A dev login stands in, refused outside localhost and in production.
- A separate agent that never sees the key may do the blind second solve, recorded as `agent:<name>`, and the puzzle page says no person has checked it. Replace these with human solves before a public launch.

## Promote undefined methods to canonical symbols

Type: Change

Goal: Give Express's main methods canonical IDs, since scip-typescript reports `app.listen = function` and `res.send = function` as locals with no definition. This replaces the "known problem" in the entry below.

What should be done: Name these methods without resolving anything by name, then report plainly what still can't be linked. Approved as a narrow exception to rule 7, now written into `CLAUDE.md`.

What was done (technical):

- `_promote` in `convert.py` handles top-level `root.name = function () {}`, including each target of a chain like `req.get = req.header = function`. Computed targets, non-function values and nested assignments don't qualify.
- The root must resolve in SCIP, at its exact position, to a symbol defined in that file. `exports.x` counts when `exports` and `x` share one SCIP local, and its ID has no root, so it reads `lib/utils.js#compileETag`.
- A method is linked to its references only through the SCIP local at its own property position. This gives two tiers, shown in the summary. `scip_local` methods can be callees. `syntax_only` methods have an ID and outgoing edges but can never be a callee.
- Aliases sharing one body each get the outgoing edges.
- On Express this took `lib/` from 14 functions and methods to 66, and from 3 call edges to 21. I read all 21 against the source and each one matches a real reference.

Still missing, and not recoverable from SCIP:

- 60 of 73 `this.method()` calls to same-file methods in `app`, `res` and `req` are unresolved, including all 47 in `response.js` and `request.js`. So `res.*` and `req.*` methods have no incoming edges.
- `app.handle` has no incoming edge and `app.listen` has no outgoing edge, because `app.listen` passes `this` to `http.createServer`. Spec section 4's Trace example can't validate at this SHA.
- `defineGetter(req, 'query', ...)` getters, `app[method]` verbs, and non-function exports like `exports.etag` have no IDs.

## Monorepo scaffold and first ingest pipeline

Type: Addition

Goal: Set up the repo layout from the spec and turn one real repo into a local snapshot, so we can judge whether canonical symbol IDs are readable enough to be puzzle answers.

What should be done: Scaffold `web/`, `ingest/`, `content/` and `supabase/`. Split env files so R2 write credentials never reach `web/`. Pin expressjs/express in `repos.yaml`. Build `uv run ingest snapshot <slug>` to fetch, filter, run SCIP, and write manifest, files, symbols, occurrences and call edges to `ingest/out/`, with no R2 or Supabase. Add tests that need no network.

What was done (technical):

- `web/` is plain create-next-app with `strict` and `noUncheckedIndexedAccess`. `pnpm e2e`, `pnpm validate` and `ingest seed` are stubs that exit 1, so an unbuilt validator can't look like a pass.
- Express is pinned to `1c6f1b0fe4000977b9a7b4f34097e4d527dd9824`, the head of `master` from `git ls-remote`.
- Fetching is a shallow fetch by SHA into a temp dir, then a rename, so an interrupted run never looks cached. `.git/info/attributes` turns off line-ending conversion, because `core.autocrlf` would otherwise change file bytes on Windows and snapshots would differ between machines.
- All filter rules live in `filter_config.py`. Symlinks are also dropped, so a repo can't pull a file from outside itself into a snapshot.
- PyPI's `scip` is an unrelated image-processing package, so `scip.proto` is vendored from scip-code/scip at `bbec5345` and compiled with `grpcio-tools`.
- scip-typescript writes backslash paths on Windows; these are normalized to forward slashes.
- ID decisions: the first holder of a name is bare, then `~2`, `~3`, numbered in source order. Lines and columns are 1-based. Locals, parameters, type parameters, file symbols and scip-typescript's meta descriptors like `weak0:` get no ID.
- scip-typescript gives no enclosing range for `a.b = function () {}`, so tree-sitter finds only where a definition ends, starting from the exact position SCIP reports. SCIP still decides what a symbol is and what refers to it. No names are matched.
- A call edge is a reference inside a callable's body, assigned to the innermost named callable. The left side of `View.prototype.lookup = ...` doesn't count. A callee has to be callable, so a variable holding a required function produces no edge.

Known problem: on Express `master` only 3 of the 9 call edges are in `lib/`. scip-typescript reports `app.listen = function`, `res.send = function` and `req.get = function` as local symbols with no definition, so about 43 methods and 12 `defineGetter` getters have no ID. Installing dependencies didn't change this. The pipeline reports the gap rather than recovering these by name, which rule 7 forbids. This blocks Find and Trace puzzles on those methods until it's decided how to handle it.

Also open: Express `master` has about 2,776 lines in `lib/` and `index.js`, below the 5k minimum in spec section 5, and no `lib/router/`, so the spec's `lib/router/layer.js#Layer.match` example doesn't exist at this SHA.
