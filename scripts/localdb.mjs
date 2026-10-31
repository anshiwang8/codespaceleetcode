// Runs a real Postgres for localhost mode, with no install, Docker or accounts.
//
//   node scripts/localdb.mjs start    Start it and apply pending migrations. Stops on Ctrl+C.
//   node scripts/localdb.mjs reset    Delete all local data. Run `start` again afterward.
//
// LOCALDB_PORT and LOCALDB_DIR let parallel checkouts run their own copy.

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.LOCALDB_PORT ?? 54329);
const DATA_DIR = resolve(process.env.LOCALDB_DIR ?? join(ROOT, ".localdb"));
const DATABASE = "codebase_puzzles";
const PASSWORD = "postgres";

function url(database) {
  return `postgres://postgres:${PASSWORD}@localhost:${PORT}/${database}`;
}

async function withClient(database, work) {
  const client = new pg.Client({ connectionString: url(database) });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function ensureDatabase() {
  await withClient("postgres", async (client) => {
    const found = await client.query("select 1 from pg_database where datname = $1", [DATABASE]);
    if (found.rowCount === 0) await client.query(`create database ${DATABASE}`);
  });
}

async function applyMigrations() {
  await withClient(DATABASE, async (client) => {
    await client.query(readFileSync(join(ROOT, "supabase/local/shim.sql"), "utf8"));
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const directory = join(ROOT, "supabase/migrations");
    for (const name of readdirSync(directory).filter((f) => f.endsWith(".sql")).sort()) {
      const applied = await client.query("select 1 from schema_migrations where name = $1", [name]);
      if (applied.rowCount !== 0) continue;
      await client.query("begin");
      try {
        await client.query(readFileSync(join(directory, name), "utf8"));
        await client.query("insert into schema_migrations (name) values ($1)", [name]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      console.log(`Applied migration ${name}`);
    }
  });
}

async function start() {
  const server = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: PASSWORD,
    port: PORT,
    persistent: true,
    onLog: () => {},
  });
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) await server.initialise();
  await server.start();

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await ensureDatabase();
  await applyMigrations();
  console.log(`Local database ready at ${url(DATABASE)}`);
}

const command = process.argv[2];
if (command === "start") {
  await start();
} else if (command === "reset") {
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log(`Deleted ${DATA_DIR}`);
} else {
  console.error("Usage: node scripts/localdb.mjs start|reset");
  process.exit(1);
}
