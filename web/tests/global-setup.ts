import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string | null;
  }
}

// Tests get their own database on the same server, so they never touch local dev data. It's
// dropped and rebuilt from the migrations on every run, which also tests the migrations.
// TEST_DATABASE_NAME gives a parallel run (another worktree or agent) its own database, since each
// run drops and rebuilds this one.
const TEST_DATABASE = (() => {
  const name = process.env.TEST_DATABASE_NAME?.trim() || "codebase_puzzles_test";
  if (!/^codebase_puzzles_test[a-z0-9_]{0,30}$/.test(name)) {
    throw new Error("TEST_DATABASE_NAME must start with codebase_puzzles_test and use only a-z, 0-9 and _");
  }
  return name;
})();
const DEFAULT_SERVER = `postgres://postgres:postgres@localhost:${process.env.LOCALDB_PORT || 54329}/postgres`;
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function databaseUrl(server: URL, database: string): string {
  const url = new URL(server);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withClient<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3_000 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function applyMigrations(client: pg.Client): Promise<void> {
  await client.query(readFileSync(path.join(REPO_ROOT, "supabase/local/shim.sql"), "utf8"));
  const directory = path.join(REPO_ROOT, "supabase/migrations");
  const names = readdirSync(directory).filter((name) => name.endsWith(".sql"));
  for (const name of names.sort()) {
    await client.query(readFileSync(path.join(directory, name), "utf8"));
  }
}

export default async function setup(project: TestProject): Promise<(() => Promise<void>) | void> {
  const server = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? DEFAULT_SERVER,
  );
  // This drops a database, so it must never point at anything but a local server.
  if (!LOCAL_HOSTNAMES.has(server.hostname)) {
    throw new Error(`Refusing to run tests against non-local database host ${server.hostname}`);
  }
  const admin = databaseUrl(server, "postgres");
  const drop = (client: pg.Client) =>
    client.query(`drop database if exists ${TEST_DATABASE} with (force)`);

  try {
    await withClient(admin, async (client) => {
      await drop(client);
      await client.query(`create database ${TEST_DATABASE}`);
    });
  } catch (error) {
    // A refused connection is an AggregateError with an empty message, but it does have a code.
    const reason = (error as NodeJS.ErrnoException).code ?? String(error);
    const message = `no Postgres at ${server.host} (${reason}). Run \`pnpm db\` first, or set TEST_DATABASE_URL.`;
    // These tests guard the answer-key rules, so skipping them must be a choice, not an accident.
    if (process.env.ALLOW_NO_DB !== "1") {
      throw new Error(`[web tests] ${message} ALLOW_NO_DB=1 runs without them.`);
    }
    console.warn(`\n[web tests] SKIPPING every database test: ${message}\n`);
    project.provide("testDatabaseUrl", null);
    return;
  }

  const url = databaseUrl(server, TEST_DATABASE);
  await withClient(url, applyMigrations);
  project.provide("testDatabaseUrl", url);
  return async () => {
    await withClient(admin, drop);
  };
}
