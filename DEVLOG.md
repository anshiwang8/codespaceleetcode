# DEVLOG

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
