# CLAUDE.md

Operational rules for working in this repo. Read `spec.md` before any non-trivial change. The spec is the source of truth; if code and spec disagree, stop and flag it.

## Project

LeetCode-style puzzles set inside real open-source repos pinned to a commit. v1 has three puzzle types: Find, Trace, Architecture. Users navigate code in a browser IDE and submit a precise answer, which is graded server-side against a canonical answer key.

## Layout

- `web/` is the Next.js App Router app (TypeScript strict), deployed on Vercel.
- `ingest/` is the Python pipeline (uv): clone, filter, SCIP index, upload to R2, seed, validate.
- `content/` holds `repos.yaml`, `schema/`, `puzzles/<repo-slug>/<id>.yaml`, `solutions/<id>.md`, and `blind-attempts.json` (each blind solver's first graded result).
- `supabase/migrations/` holds SQL migrations. Never edit an applied migration; add a new one. Hosted Supabase gives clients every privilege on a new table or sequence, so a migration that adds one must enable RLS, revoke `anon` and `authenticated`, and grant back only what clients may read. `web/tests/rls.test.ts` checks this.
- `supabase/local/shim.sql` adds what hosted Supabase provides, for the local database only.
- `web/lib/api-types.ts` holds the API response shapes the routes and UI share.
- `web/lib/topics.ts` holds the topic list's labels and descriptions. Its slugs must match the `tags` enum in `content/schema/puzzle.schema.json`, and a web test checks this.

## Non-negotiable rules

1. **Answer keys never reach the client.** `answer_json` and solutions are read only in server routes through the server-side database connection (`pg` with `DATABASE_URL`, in every environment). No answer data in props, page payloads, logs sent to the browser, or error messages. RLS denies client reads on `puzzles.answer_json` and `solutions`.
2. **Answers are canonical IDs.** Files are `path`, symbols are `path#Qualified.name[~N]`, locations are `path:Lstart-Lend`. The grader compares IDs. Never add fuzzy matching, string similarity, case-insensitive matching, or LLM grading.
3. **Users select answers, never type them.** Every answer input in the UI is built from clicks on the tree, symbols, or lines.
4. **Snapshots are immutable.** Never change the SHA of an existing snapshot. A newer commit means a new snapshot.
5. **Every puzzle passes `pnpm validate`.** Never weaken a validator check to get a puzzle through. Use `validator_overrides` with a written reason, and only when the check is a false positive.
6. **Uniqueness is fixed in the prompt, not the key.** If a puzzle has two plausible answers, tighten the prompt's scope. Only add to `accept` for truly equivalent answers (e.g. a re-export of the same function), with a reason in `accept_reasons`.
7. **Code intelligence comes from SCIP.** Don't substitute name-based matching for definitions, references, or call edges. One narrow exception: scip-typescript leaves top-level `root.name = function () {}` undefined, so `ingest/src/ingest/convert.py` promotes those methods using SCIP's resolved root and the assignment syntax at that exact position. References still come only from SCIP's own locals, never from a name lookup. tree-sitter also answers position-only questions: whether a reference at a given spot is a type, decorator or base class, and whether a Python reference sits on a `def` or `class` name.
8. **v1 scope only.** No code execution, bug-fix puzzles, or AI mode. If a task needs them, stop and flag it.

## Conventions

- TypeScript strict, no `any`. Validate route inputs with zod.
- Server-only modules go in `web/lib/server/` and import `server-only`.
- Python: type hints, `ruff` + `pyright` clean. Run with `uv run`.
- Puzzle IDs: `<repo-short>-<type>-<nnn>`, e.g. `hono-trace-002`.
- One concept per puzzle. If the prompt needs "and", split it.
- Rate difficulty by the rules in spec section 4, and tag each puzzle with 1 to 3 topics from the fixed list there.

## Testing

- Grader: unit tests for every answer kind, including wrong file, wrong order, extra/missing set members, selection outside the window, and anchor not covered.
- Validator: fixture puzzles that must pass and fixture puzzles that must fail, one per check.
- API: tests that `/api/puzzles/:slug` and errors from `/submit` never contain answer data.
- e2e (Playwright): solve one puzzle of each type end to end against a fixture snapshot.
- Run the full suite before marking any task done.

## Commands

Fill these in as they are created:

From the repo root:

```
pnpm local               # database, seed, site at http://127.0.0.1:3000 (PORT changes the port). Needs snapshots: see README.md on a fresh clone
pnpm db                  # start local Postgres, apply migrations (stays running). LOCALDB_PORT changes its port, and pnpm dev, the tests and ingest seed follow it
pnpm db:reset            # delete all local database data
pnpm dev                 # web app, bound to 127.0.0.1 because dev login trusts the Host header
pnpm test                # all unit tests: test:ingest, then test:web. Web tests fail without pnpm db running or TEST_DATABASE_URL; ALLOW_NO_DB=1 skips the database ones
pnpm --filter web lint
pnpm --filter web typecheck   # plain tsc needs next typegen first
pnpm --filter web build
pnpm e2e                 # Playwright. Starts its own database and server, and can run beside pnpm dev
pnpm validate            # every check in spec section 6
```

From `ingest/`:

```
uv run python -m ingest snapshot <slug>   # fetch, filter, index, write to ingest/out/ (no upload yet)
uv run python -m ingest snapshot-all [--force]   # every repo in repos.yaml. --force after any pipeline change, since finished snapshots are skipped
uv run python -m ingest seed [--force]    # validate, then load snapshots and puzzles into Postgres
uv run python -m ingest blind-export --out <file> [--repo <slug>]   # puzzles with only what a solver may see
uv run python -m ingest blind-check <answers.json> --solver <name> [--write]   # grade a blind solve; prints pass or fail, never the key. One graded attempt per solver per puzzle version
uv run python -m pytest         # always `python -m`: Windows Application Control can block generated .exe launchers
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run python scripts/gen_proto.py            # regenerate SCIP bindings from the vendored scip.proto
uv run python scripts/regen_fixture_index.py  # rebuild the test fixture's index after changing it
```

`INGEST_TEST_DB_URL` turns on the seed tests. It's separate from `SUPABASE_DB_URL`, so tests can't touch a real database.

`content/schema/grading-cases.json` is run by both the web and Python test suites, so the two graders can't drift apart. Add new grading rules there.

Snapshots need the indexers on PATH: `npm install -g @sourcegraph/scip-typescript@0.6.0 @sourcegraph/scip-python@0.6.8`.

Platforms: developed on Windows, and also run on macOS (Apple silicon, Node 26). Install pnpm with `npm install -g pnpm@12.6.0` when corepack isn't available. `pnpm-workspace.yaml`'s `allowBuilds` must set the `@embedded-postgres/<platform>` package to `true` on macOS and Linux, since its install script links Postgres's libraries; an unlisted package makes `pnpm install` fail. Windows runs with it set to `false`. Scripts that spawn `pnpm` need a shell only on Windows. Playwright's Desktop Chrome profile reports a Windows user agent, so Monaco uses Ctrl as its click modifier in e2e even on macOS.

## Environment

Split per package and documented in each `.env.example`; never commit real values. R2 write credentials must never appear in `web/`.

`web/.env.example`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SNAPSHOT_CDN_URL=
DATABASE_URL=
SNAPSHOT_DIR=
DEV_AUTH_TEST_HOST=
TEST_DATABASE_URL=
```

None of these are needed on localhost: `DATABASE_URL` and `SNAPSHOT_DIR` have local defaults outside production. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are reserved for Supabase sign-in, which isn't built, so nothing reads them yet. The server reaches the database only through `DATABASE_URL`.

`ingest/.env.example`:

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
SUPABASE_DB_URL=
```

## DEVLOG

Keep `DEVLOG.md` updated whenever a feature or fix lands. In the same change, update `CLAUDE.md` (rules, layout, commands, env) and `spec.md` (design, API, data model, validator checks) if what you changed makes them stale, and close or add "Still open" items in the DEVLOG. Each entry:

```
Type: Addition | Fix | Change | Removal
Goal: ...
What should be done: ...
What was done (technical): ...
```

Plain, speakable English; keep specific technical terms.
