// The production smoke test (launch checklist C9):
//
//   node scripts/smoke.mjs [playwright test arguments]
//
// It builds the web app with `next build` and runs it with `next start`, the way Vercel does, then
// checks it with web/smoke/*.spec.ts. Snapshot files come from a small local server standing in for
// the R2 CDN, on another origin, with the CORS header R2 is set up with. The app's own /snapshots
// route is off, as in production, so any code on screen came from the "CDN".
//
// Signed-in flows aren't covered: production refuses the dev login. The e2e suite has those.

import { randomBytes } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";
import { SNAPSHOT_DIR } from "../web/e2e/fixtures/seed.mjs";
import {
  cleanUpOnSignal,
  freePort,
  nextCli,
  playwrightCli,
  removeWebDir,
  runNode,
  startFixtureDatabase,
} from "./test-env.mjs";

const DIST_DIR = ".next-smoke";
const SNAPSHOT_NAME = /^[a-z0-9][a-z0-9._-]*@[0-9a-f]{40}$/;

/** Serves `snapshots/<name>/manifest.json` and `.../files/...` the way the R2 bucket will. */
function startCdn(port) {
  const root = resolve(SNAPSHOT_DIR);
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "public, no-cache");
    const send404 = () => {
      response.statusCode = 404;
      response.end("Not found");
    };
    if (request.method !== "GET" && request.method !== "HEAD") return send404();
    let segments;
    try {
      segments = new URL(request.url ?? "/", "http://cdn").pathname.split("/").slice(1).map(decodeURIComponent);
    } catch {
      return send404();
    }
    const [prefix, name, kind, ...rest] = segments;
    const isManifest = kind === "manifest.json" && rest.length === 0;
    const isFile = kind === "files" && rest.length > 0;
    if (prefix !== "snapshots" || !SNAPSHOT_NAME.test(name ?? "") || (!isManifest && !isFile)) return send404();
    const target = resolve(root, name, kind, ...rest);
    if (!target.startsWith(root + sep)) return send404();
    try {
      if (!statSync(target).isFile()) return send404();
    } catch {
      return send404();
    }
    response.setHeader("Content-Type", isManifest ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
    createReadStream(target).pipe(response);
  });
  return new Promise((resolveServer) => server.listen(port, "127.0.0.1", () => resolveServer(server)));
}

removeWebDir(DIST_DIR);
let database = null;
let cdn = null;
let exitCode = 1;
let cleanedUp = false;
async function cleanUp() {
  if (cleanedUp) return;
  cleanedUp = true;
  cdn?.close();
  await database?.stop();
  removeWebDir(DIST_DIR);
}
cleanUpOnSignal(cleanUp);

try {
  database = await startFixtureDatabase("codebase_puzzles_smoke");
  const [webPort, cdnPort] = await Promise.all([freePort(), freePort()]);
  cdn = await startCdn(cdnPort);
  const cdnUrl = `http://127.0.0.1:${cdnPort}`;
  const siteUrl = `http://127.0.0.1:${webPort}`;

  // The same variables for the build and the server, as on Vercel. NEXT_PUBLIC_* are baked in at
  // build time. Empty values win over anything in web/.env.local.
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: database.databaseUrl,
    BETTER_AUTH_URL: siteUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    NEXT_PUBLIC_SNAPSHOT_CDN_URL: cdnUrl,
    SNAPSHOT_DIR: "",
    GITHUB_CLIENT_ID: "",
    GITHUB_CLIENT_SECRET: "",
    NEXT_TELEMETRY_DISABLED: "1",
    E2E_DIST_DIR: DIST_DIR,
    SMOKE_PORT: String(webPort),
    SMOKE_CDN_URL: cdnUrl,
  };

  exitCode = await runNode(nextCli(), ["build"], env);
  if (exitCode === 0) exitCode = await runNode(playwrightCli(), ["install", "chromium"], {});
  if (exitCode === 0) {
    exitCode = await runNode(
      playwrightCli(),
      ["test", "--config", "playwright.smoke.config.ts", ...process.argv.slice(2)],
      env,
    );
  }
} finally {
  await cleanUp();
}
process.exitCode = exitCode;
