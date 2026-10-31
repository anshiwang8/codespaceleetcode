# DEVLOG

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
