import { defineConfig, devices } from "@playwright/test";

// Run this through `pnpm e2e` at the repo root (scripts/e2e.mjs), which provides the database, the
// fixture snapshot and these variables.
const port = process.env.E2E_PORT;
if (!port) throw new Error("Run the e2e tests with `pnpm e2e` from the repo root.");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Tests share one database, and one of them briefly unpublishes everything.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    colorScheme: "dark",
    viewport: { width: 1366, height: 800 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 800 } } }],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p ${port}`,
    url: `http://127.0.0.1:${port}/api/me`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
