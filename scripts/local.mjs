// `pnpm local`: everything needed to use the site on localhost, in one command. Starts the local
// database (or reuses a running one), loads snapshots and puzzles, then runs the dev server.
// Ctrl+C stops it all.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.LOCALDB_PORT ?? 54329);
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/codebase_puzzles`;
const SITE_PORT = Number(process.env.PORT ?? 3000);
const SITE_URL = `http://127.0.0.1:${SITE_PORT}`;
const children = [];

function fail(message) {
  console.error(`\n${message}`);
  stopAll();
  process.exit(1);
}

function stopAll() {
  for (const child of children) child.kill();
}

async function databaseIsUp() {
  const client = new pg.Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 1000 });
  try {
    await client.connect();
    // The migrations ran only once this table exists, and they run after the server accepts connections.
    await client.query("select 1 from puzzles limit 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureDatabase() {
  if (await databaseIsUp()) {
    console.log(`Using the database already running on port ${PORT}.`);
    const migrated = spawnSync(process.execPath, [join(ROOT, "scripts/localdb.mjs"), "migrate"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (migrated.status !== 0) fail("Applying migrations to the running database failed.");
    return;
  }
  console.log("Starting the local database...");
  const database = spawn(process.execPath, [join(ROOT, "scripts/localdb.mjs"), "start"], {
    cwd: ROOT,
    stdio: "inherit",
  });
  children.push(database);
  database.on("exit", (code) => {
    if (code) fail(`The local database stopped with exit code ${code}.`);
  });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await databaseIsUp()) return;
    await sleep(1000);
  }
  fail("The local database didn't come up within 2 minutes.");
}

function checkSnapshots() {
  const out = join(ROOT, "ingest/out");
  const snapshots = existsSync(out) ? readdirSync(out).filter((name) => name.includes("@")) : [];
  if (snapshots.length === 0) {
    fail(
      "No snapshots found in ingest/out. Build them first (this fetches and indexes every repo):\n" +
        "  cd ingest && uv run python -m ingest snapshot-all",
    );
  }
}

function seed() {
  console.log("Loading snapshots and puzzles. The first run takes a few minutes; later runs skip this.");
  const result = spawnSync("uv", ["run", "python", "-m", "ingest", "seed"], {
    cwd: join(ROOT, "ingest"),
    stdio: "inherit",
    env: { ...process.env, SUPABASE_DB_URL: DATABASE_URL },
  });
  if (result.error) {
    fail(
      "Couldn't run uv. Install it, then open a new terminal:\n" +
        "  winget install --id=astral-sh.uv -e",
    );
  }
  if (result.status !== 0) fail("Loading content failed. See the message above.");
}

function serve() {
  console.log(`\nStarting the site at ${SITE_URL}\n`);
  // pnpm is a .cmd file on Windows, which only a shell can start.
  // An explicit port fails if it's taken, where the default would quietly move to another one.
  const web = spawn(`pnpm --filter web exec next dev -H 127.0.0.1 -p ${SITE_PORT}`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL },
  });
  children.push(web);
  web.on("exit", (code) => {
    stopAll();
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

await ensureDatabase();
checkSnapshots();
seed();
serve();
