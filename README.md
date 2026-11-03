# Codebase Puzzles

LeetCode-style puzzles set inside real open-source repos, each pinned to a commit. You read the code in a browser IDE and answer by clicking on it. Answers are graded on the server by exact ID. There are 100 puzzles across 15 TypeScript and Python repos.

## Run it on localhost

No accounts, API keys or Docker needed. It has been run on macOS and Windows; Linux should work but is untested. You need Node 22 or newer, [pnpm](https://pnpm.io) 12, git and [uv](https://docs.astral.sh/uv/).

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

### On a fresh clone

Snapshots of the repos aren't committed, so build them once before `pnpm local`. This fetches and indexes all 15 repos, which takes a few minutes:

```bash
npm install -g @sourcegraph/scip-typescript@0.6.0 @sourcegraph/scip-python@0.6.8
```

```bash
cd ingest && uv run python -m ingest snapshot-all
```

## What isn't here yet

GitHub sign-in, R2 uploads and deployment aren't built. Puzzles have had a blind second solve by an agent, not a person, and each puzzle page says so. See [spec.md](spec.md) for the design and [DEVLOG.md](DEVLOG.md) for what was done and what's known to be weak.

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
