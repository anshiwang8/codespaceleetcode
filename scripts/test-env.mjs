// What the e2e runner (scripts/e2e.mjs) and the production smoke runner (scripts/smoke.mjs) share:
// a throwaway Postgres with the schema and fixture snapshot loaded, free ports, and Playwright.

import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { seedFixture } from "../web/e2e/fixtures/seed.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const WEB = join(ROOT, "web");
const PASSWORD = "postgres";

export function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

async function withClient(url, work) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Starts Postgres in a temp folder and loads the roles shim, every migration and the fixture
 * snapshot into `database`. `stop()` shuts it down and deletes the folder; it's safe to call twice.
 */
export async function startFixtureDatabase(database) {
  const dataDir = mkdtempSync(join(tmpdir(), "cp-test-db-"));
  const port = await freePort();
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "postgres",
    password: PASSWORD,
    port,
    persistent: false,
    initdbFlags: ["--encoding=UTF8"],
    onLog: () => {},
  });
  let started = false;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (started) await server.stop().catch(() => {});
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    await server.initialise();
    await server.start();
    started = true;
    const serverUrl = `postgres://postgres:${PASSWORD}@127.0.0.1:${port}`;
    const databaseUrl = `${serverUrl}/${database}`;
    await withClient(`${serverUrl}/postgres`, (client) =>
      client.query(`create database ${database} encoding 'UTF8' template template0`),
    );
    await withClient(databaseUrl, async (client) => {
      await client.query(readFileSync(join(ROOT, "supabase/local/shim.sql"), "utf8"));
      const directory = join(ROOT, "supabase/migrations");
      for (const name of readdirSync(directory).filter((file) => file.endsWith(".sql")).sort()) {
        await client.query(readFileSync(join(directory, name), "utf8"));
      }
      await seedFixture(client);
    });
    return { databaseUrl, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** Runs a Node script from web/, with these variables on top of this process's own. */
export function runNode(script, args, env) {
  return new Promise((resolveCode, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: WEB,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolveCode(code ?? 1));
  });
}

/** Playwright's CLI. The package's exports hide cli.js, so it's found through its package.json. */
export function playwrightCli() {
  const webRequire = createRequire(join(WEB, "package.json"));
  return join(dirname(webRequire.resolve("@playwright/test/package.json")), "cli.js");
}

/** Next's CLI, run with Node directly so no generated launcher is needed. */
export function nextCli() {
  return join(WEB, "node_modules/next/dist/bin/next");
}

/** Deletes a build folder under web/. */
export function removeWebDir(name) {
  rmSync(join(WEB, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** Runs `cleanUp` on Ctrl+C too, which would otherwise skip the caller's finally block. */
export function cleanUpOnSignal(cleanUp) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      void Promise.resolve(cleanUp()).finally(() => process.exit(130));
    });
  }
}
