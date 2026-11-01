# Codebase Puzzles: web app

The Next.js app. See `spec.md` and `CLAUDE.md` at the repo root for what it does and the rules it follows.

From the repo root:

```
pnpm db     # local Postgres; leave it running
pnpm dev    # this app, on http://127.0.0.1:3000
pnpm e2e    # Playwright, starting its own database and server
```

To have puzzles to look at, run `uv run ingest seed` from `ingest/`.
