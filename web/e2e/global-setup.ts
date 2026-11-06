import { chromium, type FullConfig } from "@playwright/test";

/** `next dev` compiles on first visit, and Monaco is slow. Do it once here, not inside a test. */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("No baseURL configured");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/", { timeout: 180_000 });
    await page.goto("/puzzles", { timeout: 180_000 });
    await page.goto("/puzzles/e2e-find-symbol", { timeout: 180_000 });
    await page.locator(".monaco-editor .view-line").first().waitFor({ timeout: 180_000 });
    await page.goto("/profile", { timeout: 180_000 });
    if (process.env.VISUAL_REVIEW) {
      // Compile these route handlers before motion assertions. Invalid signed-out requests do
      // not create activity; the screenshot contexts use their own deterministic accounts.
      await page.request.post("/api/puzzles/e2e-arch-choice/submit", { data: {} });
      await page.request.get("/api/me/history");
    }
  } finally {
    await browser.close();
  }
}
