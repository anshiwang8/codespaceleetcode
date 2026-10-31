# CLAUDE.md

Operational rules for working in this repo. Read `spec.md` before any non-trivial change. The spec is the source of truth; if code and spec disagree, stop and flag it.

## Project

LeetCode-style puzzles set inside real open-source repos pinned to a commit. v1 has three puzzle types: Find, Trace, Architecture. Users navigate code in a browser IDE and submit a precise answer, which is graded server-side against a canonical answer key.

## Layout

- `web/` is the Next.js App Router app (TypeScript strict), deployed on Vercel.
- `ingest/` is the Python pipeline (uv): clone, filter, SCIP index, upload to R2, seed, validate.
- `content/` holds `repos.yaml`, `schema/`, `puzzles/<repo-slug>/<id>.yaml`, `solutions/<id>.md`.
- `supabase/migrations/` holds SQL migrations. Never edit an applied migration; add a new one.
- `supabase/local/shim.sql` adds what hosted Supabase provides, for the local database only.
- `web/lib/api-types.ts` holds the API response shapes the routes and UI share.

## Non-negotiable rules

1. **Answer keys never reach the client.** `answer_json` and solutions are read only in server routes with the service role. No answer data in props, page payloads, logs sent to the browser, or error messages. RLS denies client reads on `puzzles.answer_json` and `solutions`.
2. **Answers are canonical IDs.** Files are `path`, symbols are `path#Qualified.name[~N]`, locations are `path:Lstart-Lend`. The grader compares IDs. Never add fuzzy matching, string similarity, case-insensitive matching, or LLM grading.
3. **Users select answers, never type them.** Every answer input in the UI is built from clicks on the tree, symbols, or lines.
4. **Snapshots are immutable.** Never change the SHA of an existing snapshot. A newer commit means a new snapshot.
5. **Every puzzle passes `pnpm validate`.** Never weaken a validator check to get a puzzle through. Use `validator_overrides` with a written reason, and only when the check is a false positive.
6. **Uniqueness is fixed in the prompt, not the key.** If a puzzle has two plausible answers, tighten the prompt's scope. Only add to `accept` for truly equivalent answers (e.g. a re-export of the same function), with a reason in `accept_reasons`.
7. **Code intelligence comes from SCIP.** Don't substitute name-based matching for definitions, references, or call edges. One narrow exception: scip-typescript leaves top-level `root.name = function () {}` undefined, so `ingest/src/ingest/convert.py` promotes those methods using SCIP's resolved root and the assignment syntax at that exact position. References still come only from SCIP's own locals, never from a name lookup.
8. **v1 scope only.** No code execution, bug-fix puzzles, or AI mode. If a task needs them, stop and flag it.

## Conventions

- TypeScript strict, no `any`. Validate route inputs with zod.
- Server-only modules go in `web/lib/server/` and import `server-only`.
- Python: type hints, `ruff` + `pyright` clean. Run with `uv run`.
- Puzzle IDs: `<repo-short>-<type>-<nnn>`, e.g. `express-trace-002`.
- One concept per puzzle. If the prompt needs "and", split it.

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
pnpm db                  # start local Postgres, apply migrations (stays running)
pnpm db:reset            # delete all local database data
pnpm dev                 # web app, bound to 127.0.0.1 because dev login trusts the Host header
pnpm test                # all unit tests: test:ingest, then test:web (needs pnpm db running)
pnpm --filter web lint
pnpm --filter web typecheck   # plain tsc needs next typegen first
pnpm --filter web build
pnpm e2e                 # stub, exits 1: Playwright isn't set up yet
pnpm validate            # stub, exits 1: ingest/validate.py doesn't exist yet
```

From `ingest/`:

```
uv run ingest snapshot <slug>   # fetch, filter, index, write to ingest/out/ (no upload yet)
uv run ingest seed              # stub, exits 1: will load content/ into Postgres
uv run python -m pytest         # not `uv run pytest`: Windows Application Control can block pytest.exe
uv run ruff check .
uv run ruff format --check .
uv run pyright
uv run python scripts/gen_proto.py            # regenerate SCIP bindings from the vendored scip.proto
uv run python scripts/regen_fixture_index.py  # rebuild the test fixture's index after changing it
```

`snapshot` needs `scip-typescript` on PATH: `npm install -g @sourcegraph/scip-typescript@0.6.0`.

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

None of these are needed on localhost: `DATABASE_URL` and `SNAPSHOT_DIR` have local defaults outside production.

`ingest/.env.example`:

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
SUPABASE_DB_URL=
```

## DEVLOG

Keep `DEVLOG.md` updated whenever a feature or fix lands. Each entry:

```
Type: Addition | Fix | Change | Removal
Goal: ...
What should be done: ...
What was done (technical): ...
```

Plain, speakable English; keep specific technical terms.
