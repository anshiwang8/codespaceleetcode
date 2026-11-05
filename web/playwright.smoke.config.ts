import { defineConfig, devices } from "@playwright/test";

// The production smoke test. Run it with `pnpm smoke` at the repo root (scripts/smoke.mjs), which
// builds the app and provides the database, the stand-in CDN and these variables.
const port = process.env.SMOKE_PORT;
if (!port) throw new Error("Run the smoke test with `pnpm smoke` from the repo root.");

export default defineConfig({
  testDir: "./smoke",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1366, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 800 } } }],
  webServer: {
    command: `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}/api/me`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
