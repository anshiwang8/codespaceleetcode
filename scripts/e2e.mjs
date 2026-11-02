// Runs the Playwright suite with everything it needs, and removes it all afterward:
//
//   node scripts/e2e.mjs [playwright test arguments]
//
// It starts its own Postgres in a temp folder on a free port, loads the fixture snapshot, and lets
// Playwright start the web app on another free port. Nothing touches `pnpm db` or `pnpm dev`.
//
// It runs `next dev` rather than a production build because dev login is refused in production.

import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { seedFixture, SNAPSHOT_DIR } from "../web/e2e/fixtures/seed.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const DATABASE = "codebase_puzzles_e2e";
const PASSWORD = "postgres";

function freePort() {
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

async function prepareDatabase(serverUrl, databaseUrl) {
  await withClient(`${serverUrl}/postgres`, (client) =>
    client.query(`create database ${DATABASE} encoding 'UTF8' template template0`),
  );
  await withClient(databaseUrl, async (client) => {
    await client.query(readFileSync(join(ROOT, "supabase/local/shim.sql"), "utf8"));
    const directory = join(ROOT, "supabase/migrations");
    for (const name of readdirSync(directory).filter((file) => file.endsWith(".sql")).sort()) {
      await client.query(readFileSync(join(directory, name), "utf8"));
    }
    await seedFixture(client);
  });
}

function runNode(script, args, env) {
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

// Always a cold build. Restoring Turbopack's cache from a run on another port left every other run
// stuck with the page reloading forever.
const DIST_DIR = ".next-e2e";
const removeBuild = () =>
  rmSync(join(WEB, DIST_DIR), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
removeBuild();

const dataDir = mkdtempSync(join(tmpdir(), "cp-e2e-"));
const [dbPort, webPort] = await Promise.all([freePort(), freePort()]);
const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: PASSWORD,
  port: dbPort,
  persistent: false,
  initdbFlags: ["--encoding=UTF8"],
  onLog: () => {},
});

let started = false;
let exitCode = 1;
let cleanedUp = false;
async function cleanUp() {
  if (cleanedUp) return;
  cleanedUp = true;
  if (started) await server.stop().catch(() => {});
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  removeBuild();
}
// Ctrl+C would otherwise end the process before the finally block runs, leaving the temp database
// folder and the build behind.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void cleanUp().finally(() => process.exit(130));
  });
}
try {
  await server.initialise();
  await server.start();
  started = true;
  const serverUrl = `postgres://postgres:${PASSWORD}@127.0.0.1:${dbPort}`;
  const databaseUrl = `${serverUrl}/${DATABASE}`;
  await prepareDatabase(serverUrl, databaseUrl);

  // The package's exports hide cli.js, so find the folder through its package.json.
  const webRequire = createRequire(join(WEB, "package.json"));
  const cli = join(dirname(webRequire.resolve("@playwright/test/package.json")), "cli.js");

  // Does nothing, quickly, once the browser is there.
  exitCode = await runNode(cli, ["install", "chromium"], {});
  if (exitCode === 0) {
    exitCode = await runNode(cli, ["test", ...process.argv.slice(2)], {
      E2E_PORT: String(webPort),
      DATABASE_URL: databaseUrl,
      SNAPSHOT_DIR,
      NEXT_PUBLIC_SNAPSHOT_CDN_URL: "",
      NEXT_TELEMETRY_DISABLED: "1",
      E2E_DIST_DIR: DIST_DIR,
    });
  }
} finally {
  await cleanUp();
}
process.exitCode = exitCode;
