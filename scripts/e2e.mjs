// Runs the Playwright suite with everything it needs, and removes it all afterward:
//
//   node scripts/e2e.mjs [playwright test arguments]
//
// It starts its own Postgres in a temp folder on a free port, loads the fixture snapshot, and lets
// Playwright start the web app on another free port. Nothing touches `pnpm db` or `pnpm dev`.
//
// It runs `next dev` rather than a production build because dev login is refused in production.
// scripts/smoke.mjs checks a production build.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SNAPSHOT_DIR } from "../web/e2e/fixtures/seed.mjs";
import {
  cleanUpOnSignal,
  freePort,
  playwrightCli,
  removeWebDir,
  runNode,
  startFixtureDatabase,
} from "./test-env.mjs";

// Always a cold build. Restoring Turbopack's cache from a run on another port left every other run
// stuck with the page reloading forever.
const DIST_DIR = process.env.VISUAL_REVIEW ? ".next-visual" : ".next-e2e";
removeWebDir(DIST_DIR);

let database = null;
let exitCode = 1;
let cleanedUp = false;
async function cleanUp() {
  if (cleanedUp) return;
  cleanedUp = true;
  await database?.stop();
  removeWebDir(DIST_DIR);
}
cleanUpOnSignal(cleanUp);

try {
  database = await startFixtureDatabase("codebase_puzzles_e2e");
  // Email the app "sends" during the run lands here, where the tests read links from it.
  const outbox = mkdtempSync(join(tmpdir(), "codebases-outbox-"));
  const webPort = await freePort();
  const cli = playwrightCli();
  if (process.env.VISUAL_REVIEW) console.log(`Visual review: isolated fixture app at http://127.0.0.1:${webPort}`);

  // Does nothing, quickly, once the browser is there.
  exitCode = await runNode(cli, ["install", "chromium"], {});
  if (exitCode === 0) {
    exitCode = await runNode(cli, ["test", ...process.argv.slice(2)], {
      E2E_PORT: String(webPort),
      DATABASE_URL: database.databaseUrl,
      SNAPSHOT_DIR,
      NEXT_PUBLIC_SNAPSHOT_CDN_URL: "",
      // The tests expect GitHub sign-in off, even when a developer's web/.env.local sets up an
      // OAuth app. An empty value here wins over the file.
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      NEXT_TELEMETRY_DISABLED: "1",
      E2E_DIST_DIR: DIST_DIR,
      DEV_OUTBOX_DIR: outbox,
      // A developer's web/.env.local might configure real email delivery; the tests never send mail.
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    });
  }
} finally {
  await cleanUp();
}
process.exitCode = exitCode;
