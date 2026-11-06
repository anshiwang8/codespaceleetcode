import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig(config, {
  testIgnore: [],
  testMatch: /visual-review\.spec\.ts|visual-themes\.spec\.ts|motion\.spec\.ts/,
  timeout: 120_000,
  outputDir: "test-results-visual",
  use: { colorScheme: "light", timezoneId: "UTC", reducedMotion: "no-preference" },
  reporter: [["list"], ["json", { outputFile: "visual-review/results.json" }]],
});
