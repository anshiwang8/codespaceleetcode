import { expect, type Page, test } from "@playwright/test";
import { FILES, openFile, openPuzzle, signIn, submitAndExpect } from "./helpers";

/**
 * Every Content Security Policy violation on this page, from the browser's own event and from the
 * console, where Chrome also reports blocked workers and resources.
 */
function cspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    if (/Content Security Policy/i.test(error.message)) violations.push(`pageerror: ${error.message}`);
  });
  void page.exposeFunction("__reportCspViolation", (text: string) => violations.push(text));
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const report = (window as unknown as { __reportCspViolation: (text: string) => void }).__reportCspViolation;
      report(`${event.violatedDirective} blocked ${event.blockedURI || "inline"} at ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  return violations;
}

test.describe("security headers", () => {
  for (const path of ["/", "/puzzles", "/puzzles/e2e-find-symbol", "/api/me"]) {
    test(`${path} sends the security headers`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.ok()).toBe(true);
      const headers = response.headers();
      const csp = headers["content-security-policy"] ?? "";
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-powered-by"]).toBeUndefined();
    });
  }

  test("snapshot files carry them too", async ({ request }) => {
    const response = await request.get("/api/puzzles/e2e-find-symbol");
    expect(response.ok()).toBe(true);
    const { snapshot } = (await response.json()) as { snapshot: { manifestUrl: string } };
    const manifest = await request.get(snapshot.manifestUrl);
    expect(manifest.ok()).toBe(true);
    expect(manifest.headers()["content-security-policy"]).toContain("default-src 'self'");
    expect(manifest.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("the landing page and puzzle list load with no violations", async ({ page }) => {
    const violations = cspViolations(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.goto("/puzzles");
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("Monaco, its worker, go-to-definition and references run with no violations", async ({ page }) => {
    const violations = cspViolations(page);
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.router);
    // The worker starts with the editor; give it a moment to report anything it was refused.
    await page.waitForLoadState("networkidle");
    await openFile(page, FILES.index);
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("sign-in, a submit and a solution with mermaid diagrams run with no violations", async ({ page }) => {
    const violations = cspViolations(page);
    await openPuzzle(page, "e2e-find-file");
    await signIn(page);
    await page.locator('[data-testid="tree-dir"][data-path="src"]').click();
    await page.locator(`[data-testid="tree-pick"][data-path="${FILES.config}"]`).click();
    await submitAndExpect(page, true);
    await page.getByTestId("view-solution").click();
    const solution = page.getByTestId("solution");
    await expect(solution.locator('[data-testid="mermaid-diagram"][data-state="ready"] svg')).toBeVisible();
    await solution.getByTestId("mermaid-expand").click();
    await expect(page.getByTestId("mermaid-dialog").locator("svg")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(violations).toEqual([]);
  });

  test("another site can't frame the app", async ({ page }) => {
    const target = new URL("/", test.info().project.use.baseURL).toString();
    // about:blank with set content is an opaque origin, so this is a different site framing ours.
    const blocked = page.waitForEvent("console", (message) => /frame-ancestors/.test(message.text()));
    await page.setContent(`<iframe id="frame" src="${target}"></iframe>`);
    // Chrome refuses to render it and says why. The frame never gets the landing page.
    await blocked;
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
    const title = frame ? await frame.title().catch(() => "") : "";
    expect(title).not.toContain("codebases");
  });
});
