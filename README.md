# codebases

LeetCode-style puzzles set inside real open-source repos, each pinned to a commit. You read the code in a browser IDE and answer by clicking on it. Answers are graded on the server by exact ID. There are 136 puzzles across 21 TypeScript, JavaScript and Python repos.

## Run it on localhost

No accounts, API keys or Docker needed. It has been run on macOS and Windows, and CI runs it on Linux (Ubuntu). You need Node 22 or newer, [pnpm](https://pnpm.io) 12, git and [uv](https://docs.astral.sh/uv/).

macOS or Linux:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
npm install -g pnpm@12.6.0
```

Windows:

```bash
winget install --id=astral-sh.uv -e
npm install -g pnpm@12.6.0
```

Open a new terminal after installing uv, then:

```bash
pnpm install
```

```bash
pnpm local
```

That starts a local Postgres, loads the content, and serves the site at <http://127.0.0.1:3000>. The first load takes under a minute. Press Ctrl+C to stop it. Use the **Sign in** button in the header: it's a local dev login with no password, and you need it to submit answers.

### GitHub sign-in

Real sign-in uses [Better Auth](https://www.better-auth.com) with GitHub. To turn it on locally:

1. Create a GitHub OAuth app at github.com → Settings → Developer settings → OAuth Apps. Set the homepage to `http://127.0.0.1:3000` and the callback URL to `http://127.0.0.1:3000/api/auth/callback/github`. Use `127.0.0.1`, not `localhost`, because that's where the site runs and the session cookie belongs to one hostname.
2. Copy `web/.env.example` to `web/.env.local` and fill in `BETTER_AUTH_SECRET` (from `openssl rand -base64 32`), `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
3. Restart `pnpm local`. **Log in** on the landing page and **Sign in with GitHub** in the header now go to GitHub. The dev login stays available on localhost.

### On a fresh clone

Snapshots of the repos aren't committed, so build them once before `pnpm local`. This fetches and indexes all 21 repos, which takes a few minutes:

```bash
npm install -g @sourcegraph/scip-typescript@0.6.0 @sourcegraph/scip-python@0.6.8
```

```bash
cd ingest && uv run python -m ingest snapshot-all
```

## What isn't here yet

The site isn't deployed yet: that needs the domain, database, R2 bucket and Vercel accounts, which a person has to set up. The code side is done except error monitoring. [spec.md section 14](spec.md#14-launch-checklist) is the launch checklist: what's left, who can do it, and the exact steps for everything that needs a person with account access. Puzzles have had a blind second solve by an agent, not a person, and each puzzle page says so. See [spec.md](spec.md) for the design and [DEVLOG.md](DEVLOG.md) for what was done and what's known to be weak.

## Developing

[CLAUDE.md](CLAUDE.md) has the rules and every command. The main checks:

```bash
pnpm db
```

Leave that running in one terminal, and in another:

```bash
pnpm test
```

```bash
pnpm e2e
```

```bash
pnpm validate
```

`pnpm smoke` builds the site for production and checks it with Playwright, with a local stand-in for the CDN. CI (`.github/workflows/ci.yml`) runs all of these on every pull request and every push to `main`. For `pnpm test` to include the ingest database tests, set `INGEST_TEST_DB_URL` to the `pnpm db` server, for example `postgres://postgres:postgres@localhost:54329/postgres`.

### Hosted database and R2

These read credentials from `ingest/.env` (copy `ingest/.env.example`), and only when you pass the file, so they can't hit a hosted service by accident. Each has `--dry-run`:

```bash
cd ingest && uv run --env-file .env python -m ingest migrate
```

```bash
cd ingest && uv run --env-file .env python -m ingest upload-all
```
