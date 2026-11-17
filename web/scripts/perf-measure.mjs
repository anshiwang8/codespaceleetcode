// Development-only performance measurement. Builds (with --build) and starts a production server
// on localhost against the local database, signs in as a throwaway GitHub-style user made just for
// the run, then times pages and API routes and counts the database queries each one makes.
//
//   pnpm db                                   # the local database must be running and seeded
//   cd web && node scripts/perf-measure.mjs --build --label baseline --out ../docs/perf/baseline.json
//
// Options:
//   --build          run `next build` first (into .next-perf, so it never touches .next)
//   --port N         server port (default 3210)
//   --runs N         measured requests per route (default 15, after 3 warm-up requests)
//   --latency MS     delay added before each query, standing in for Vercel-to-database latency
//   --pool N         database pool size (default 3, the size production uses on Vercel)
//   --browser        also measure in Chromium: load, hydration, JavaScript, theme picker, navigation
//   --label TEXT     a name for this run, printed and saved
//   --out FILE       write the results as JSON
//
// The server's PERF_TRACE_FILE (lib/server/perf-trace.ts) records each query's duration and the
// start of its SQL, never its parameters. Requests run one at a time, so every line written while
// a request is in flight belongs to it. The throwaway user is deleted at the end.

import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { makeSignature } from "better-auth/crypto";
import pg from "pg";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const PORT = Number(option("port", "3210"));
const RUNS = Number(option("runs", "15"));
const WARMUP = 3;
const LATENCY = Number(option("latency", "0"));
const POOL = Number(option("pool", "3"));
const LABEL = option("label", "run");
const OUT = option("out", null);
const DIST = ".next-perf";
const ORIGIN = `http://127.0.0.1:${PORT}`;
const DATABASE_URL =
  process.env.DATABASE_URL ?? `postgres://postgres:postgres@localhost:${process.env.LOCALDB_PORT || 54329}/codebase_puzzles`;
// A fresh secret each run: sessions signed for one run are worthless to anything else.
const SECRET = randomBytes(32).toString("hex");

const ROUTES = [
  { name: "Settings page", path: "/settings" },
  { name: "Profile page", path: "/profile" },
  { name: "Puzzle list page", path: "/puzzles" },
  { name: "Puzzle page", path: "/puzzles/hono-trace-002" },
  { name: "Leaderboard page", path: "/leaderboard" },
  { name: "GET /api/me", path: "/api/me" },
  { name: "GET /api/puzzles", path: "/api/puzzles" },
  { name: "GET /api/leaderboard", path: "/api/leaderboard" },
  { name: "GET /api/me (signed out)", path: "/api/me", anonymous: true },
  { name: "Puzzle list page (signed out)", path: "/puzzles", anonymous: true },
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const p90 = (values) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * 0.9))];
const round = (value) => Math.round(value * 10) / 10;

function build() {
  console.log("Building into .next-perf ...");
  const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    cwd: WEB,
    stdio: "inherit",
    // Production refuses to build without these; the start below sets the real ones for the run.
    env: { ...process.env, E2E_DIST_DIR: DIST, NODE_ENV: "production", BETTER_AUTH_URL: ORIGIN, BETTER_AUTH_SECRET: SECRET },
  });
  if (result.status !== 0) throw new Error("next build failed");
}

function startServer(traceFile) {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(PORT)], {
    cwd: WEB,
    stdio: ["ignore", "ignore", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      E2E_DIST_DIR: DIST,
      DATABASE_URL,
      BETTER_AUTH_SECRET: SECRET,
      BETTER_AUTH_URL: ORIGIN,
      PERF_TRACE_FILE: traceFile,
      PERF_DB_LATENCY_MS: String(LATENCY),
      PERF_POOL_MAX: String(POOL),
      // GitHub sign-in isn't used: the session is made directly below.
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
    },
  });
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return server;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${ORIGIN}/api/me`);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error("The server didn't start");
}

/** A GitHub-style user with a session, profile, links, a 120 KB picture, an email and a leaderboard entry. */
async function makeUser(client) {
  const login = `perf-${randomBytes(3).toString("hex")}`;
  const { rows } = await client.query(
    `insert into auth_users (name, email, email_verified, github_login)
     values ($1, gen_random_uuid()::text || '@github-user.invalid', false, $1) returning id`,
    [login],
  );
  const id = rows[0].id;
  const token = randomBytes(24).toString("base64url");
  await client.query(
    `insert into auth_sessions (id, token, user_id, expires_at, updated_at)
     values ($1, $2, $3, now() + interval '1 day', now())`,
    [randomUUID(), token, id],
  );
  await client.query("insert into users (id, github_login) values ($1, $2)", [id, login]);
  await client.query(
    `insert into user_profiles (user_id, display_name, pronouns, bio, links)
     values ($1, 'Perf Tester', 'they/them', 'Measuring.', $2::jsonb)`,
    [id, JSON.stringify({ github: `https://github.com/${login}`, custom: [{ label: "Blog", url: "https://example.com/" }] })],
  );
  await client.query(
    "insert into user_avatars (user_id, image, content_type, version) values ($1, $2, 'image/webp', $3)",
    [id, randomBytes(120_000), randomBytes(8).toString("hex")],
  );
  await client.query("insert into user_emails (user_id, email, verified_at) values ($1, $2, now())", [id, `${login}@example.com`]);
  await client.query("insert into leaderboard_entries (user_id, public_name) values ($1, $2)", [id, login]);
  await client.query(
    "insert into user_preferences (user_id, theme_mode, favorite_themes) values ($1, 'system', '{}')",
    [id],
  );
  const cookie = `better-auth.session_token=${token}.${await makeSignature(token, SECRET)}`;
  return { id, login, cookie };
}

function traceLinesSince(file, offset) {
  if (!existsSync(file)) return { lines: [], offset };
  const size = statSync(file).size;
  if (size <= offset) return { lines: [], offset };
  const text = readFileSync(file, "utf8").slice(offset);
  return {
    lines: text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
    offset: size,
  };
}

async function measureRoutes(traceFile, cookie) {
  const results = [];
  let offset = existsSync(traceFile) ? statSync(traceFile).size : 0;
  for (const route of ROUTES) {
    const headers = route.anonymous ? {} : { cookie };
    const samples = [];
    for (let run = 0; run < WARMUP + RUNS; run += 1) {
      const started = performance.now();
      const response = await fetch(`${ORIGIN}${route.path}`, { headers, redirect: "manual" });
      const ttfb = performance.now() - started;
      const body = await response.arrayBuffer();
      const total = performance.now() - started;
      // Lines are appended synchronously before the response finishes, but give stragglers a moment.
      await sleep(5);
      const trace = traceLinesSince(traceFile, offset);
      offset = trace.offset;
      if (!response.ok) throw new Error(`${route.path} answered ${response.status}`);
      if (run < WARMUP) continue;
      const queries = trace.lines.filter((line) => line.kind === "query");
      const auth = trace.lines.filter((line) => line.kind === "auth");
      samples.push({
        ttfb,
        total,
        bytes: body.byteLength,
        queries: queries.length,
        queryMs: queries.reduce((sum, line) => sum + line.ms, 0),
        authMs: auth.reduce((sum, line) => sum + line.ms, 0),
        sql: queries.map((line) => line.detail),
      });
    }
    const pick = (key) => samples.map((sample) => sample[key]);
    results.push({
      name: route.name,
      path: route.path,
      signedIn: !route.anonymous,
      ttfbMedian: round(median(pick("ttfb"))),
      ttfbP90: round(p90(pick("ttfb"))),
      totalMedian: round(median(pick("total"))),
      queriesMedian: median(pick("queries")),
      queryMsMedian: round(median(pick("queryMs"))),
      authMsMedian: round(median(pick("authMs"))),
      bytesMedian: median(pick("bytes")),
      sqlSample: samples[samples.length - 1].sql,
    });
  }
  return results;
}

async function measureBrowser(cookieValue) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const out = {};
  const contextFor = async () => {
    const context = await browser.newContext();
    const [name, ...rest] = cookieValue.split("=");
    await context.addCookies([{ name, value: rest.join("="), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    return context;
  };

  // Cold load of /settings, in a fresh context each time so nothing is cached.
  const loads = [];
  for (let run = 0; run < 5; run += 1) {
    const context = await contextFor();
    const page = await context.newPage();
    let meRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/me") meRequests += 1;
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const started = Date.now();
    await page.goto(`${ORIGIN}/settings`, { waitUntil: "commit" });
    await page.locator('[data-testid="settings"]').first().waitFor({ state: "visible" });
    const settingsVisible = Date.now() - started;
    await page.locator('[data-testid^="theme-option-"]').first().waitFor({ state: "attached" });
    const themesVisible = Date.now() - started;
    await page.waitForLoadState("networkidle");
    const metrics = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((metric) => [metric.name, metric.value]));
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const scripts = performance.getEntriesByType("resource").filter((entry) => entry.initiatorType === "script" || entry.name.endsWith(".js"));
      return {
        ttfb: nav.responseStart - nav.startTime,
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        load: nav.loadEventEnd - nav.startTime,
        jsTransferred: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
        jsDecoded: scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
        jsFiles: scripts.length,
        themeOptions: document.querySelectorAll('[data-testid^="theme-option-"]').length,
        domNodes: document.getElementsByTagName("*").length,
      };
    });
    loads.push({
      ...timing,
      settingsVisible,
      themesVisible,
      meRequests,
      scriptMs: metrics.ScriptDuration * 1000,
      taskMs: metrics.TaskDuration * 1000,
    });
    await context.close();
  }
  const pick = (key) => loads.map((load) => load[key]);
  out.settingsColdLoad = Object.fromEntries(
    ["ttfb", "settingsVisible", "themesVisible", "domContentLoaded", "load", "scriptMs", "taskMs", "jsTransferred", "jsDecoded", "jsFiles", "meRequests", "themeOptions", "domNodes"].map((key) => [key, round(median(pick(key)))]),
  );

  // Theme picker interactions at 4x CPU slowdown: choosing a theme, and typing in the search box.
  {
    const context = await contextFor();
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/settings`);
    await page.locator('[data-testid^="theme-option-"]').nth(20).waitFor({ state: "attached" });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const choose = [];
    for (let run = 0; run < 8; run += 1) {
      const ms = await page.evaluate(async (index) => {
        const options = [...document.querySelectorAll('[data-testid^="theme-option-"] input')];
        const input = options[10 + index];
        const label = input.closest("label");
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        const started = performance.now();
        input.click();
        while (!label.hasAttribute("data-checked")) await frame();
        await frame();
        return performance.now() - started;
      }, run);
      choose.push(ms);
    }
    const search = [];
    const box = page.getByTestId("theme-search");
    for (const text of ["d", "da", "dar", "dark", "", "s", "so", "sol", ""]) {
      const ms = await page.evaluate(async (value) => {
        const input = document.querySelector('[data-testid="theme-search"]');
        const list = document.querySelector('[data-testid="theme-list"]');
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        const before = list.innerHTML.length;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        const started = performance.now();
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        for (let tries = 0; tries < 200 && list.innerHTML.length === before; tries += 1) await frame();
        await frame();
        return performance.now() - started;
      }, text);
      search.push(ms);
    }
    await box.fill("");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    out.themePicker4xCpu = { chooseMedian: round(median(choose)), searchKeystrokeMedian: round(median(search)) };
    await context.close();
  }

  // Repeat navigation: Settings -> Profile -> Settings through the header's account menu.
  {
    const context = await contextFor();
    const page = await context.newPage();
    await page.goto(`${ORIGIN}/settings`);
    await page.locator('[data-testid="settings"]').first().waitFor();
    await page.waitForLoadState("networkidle");
    const visit = async (path, testId) => {
      const button = page.getByTestId("account-menu-button").filter({ visible: true });
      await button.click();
      const started = Date.now();
      await page.getByTestId("account-menu").filter({ visible: true }).locator(`a[href="${path}"]`).click();
      await page.locator(`[data-testid="${testId}"]`).filter({ visible: true }).first().waitFor();
      return Date.now() - started;
    };
    const toSettings = [];
    for (let run = 0; run < 5; run += 1) {
      await visit("/profile", "profile");
      toSettings.push(await visit("/settings", "settings"));
    }
    out.repeatNavigationToSettings = { median: round(median(toSettings)), runs: toSettings };
    await context.close();
  }
  await browser.close();
  return out;
}

async function main() {
  if (flag("build")) build();
  if (!existsSync(join(WEB, DIST))) throw new Error("No build in .next-perf. Run with --build.");
  const traceDir = mkdtempSync(join(tmpdir(), "perf-trace-"));
  const traceFile = join(traceDir, "trace.jsonl");
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  const server = startServer(traceFile);
  let user;
  try {
    await waitForServer();
    user = await makeUser(db);
    const routes = await measureRoutes(traceFile, user.cookie);
    const browser = flag("browser") ? await measureBrowser(user.cookie) : null;
    const result = {
      label: LABEL,
      date: new Date().toISOString(),
      environment: {
        server: "next start (production build) on 127.0.0.1",
        database: "local embedded Postgres",
        addedQueryLatencyMs: LATENCY,
        poolMax: POOL,
        runsPerRoute: RUNS,
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
      },
      routes,
      browser,
    };
    console.log(`\n${LABEL} (added query latency ${LATENCY} ms, pool ${POOL})`);
    console.table(
      routes.map((route) => ({
        route: route.name,
        "TTFB ms": route.ttfbMedian,
        "p90 ms": route.ttfbP90,
        "total ms": route.totalMedian,
        queries: route.queriesMedian,
        "query ms": route.queryMsMedian,
        "auth ms": route.authMsMedian,
        KB: round(route.bytesMedian / 1024),
      })),
    );
    if (browser) console.log(JSON.stringify(browser, null, 2));
    if (OUT) writeFileSync(resolve(OUT), `${JSON.stringify(result, null, 2)}\n`);
  } finally {
    server.kill();
    if (user) await db.query("delete from auth_users where id = $1", [user.id]);
    await db.end();
    rmSync(traceDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
