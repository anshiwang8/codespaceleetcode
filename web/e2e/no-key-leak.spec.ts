import { expect, type Page, test } from "@playwright/test";
import { FILES, openFile, openPuzzle, signIn, submitAndExpect } from "./helpers";

// Rule 1: answer keys never reach the client. The sentinel symbol exists in the fixture as the answer
// to e2e-sentinel, in a file these tests never open, so it can only show up through a leak.

const KEY_SENTINEL = "KEYTOKEN";
const SOLUTION_SENTINEL = "SOLUTIONTOKEN";

// Names only an answer key uses. Quoted, because bare words like "window" are everywhere in JS.
const KEY_FIELD_MARKERS = [
  "answer_json",
  "answerJson",
  '"accept"',
  '"accept_reasons"',
  '"accept_sequences"',
  '"anchor"',
  '"window"',
  '"option"',
  '"correct"',
];

interface Captured {
  url: string;
  contentType: string;
  body: string;
}

function capture(page: Page): Captured[] {
  const captured: Captured[] = [];
  page.on("response", async (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    if (!/json|html|text|javascript|x-component/.test(contentType)) return;
    try {
      captured.push({ url: response.url(), contentType, body: await response.text() });
    } catch {
      // A redirect or a body discarded by navigation has nothing to scan.
    }
  });
  return captured;
}

/** The app's own data: the page, its RSC payloads and API responses, not library code. */
function isAppData(item: Captured): boolean {
  return !/javascript|css/.test(item.contentType);
}

test.describe("no answer key on the client", () => {
  test("the sentinel's key isn't in the HTML or any response", async ({ page }) => {
    const captured = capture(page);
    const response = await page.goto("/puzzles/e2e-sentinel");
    const html = (await response?.text()) ?? "";
    await expect(page.getByTestId("file-tree")).toBeVisible();
    await page.locator(".monaco-editor .view-line").first().waitFor();
    await page.waitForLoadState("networkidle");

    expect(html).toContain("A puzzle whose answer nobody should see");
    expect(html).not.toContain(KEY_SENTINEL);
    expect(html).not.toContain(SOLUTION_SENTINEL);
    expect(captured.length).toBeGreaterThan(3);
    // Every response of any type, JavaScript bundles included.
    for (const item of captured) {
      expect(item.body, item.url).not.toContain(KEY_SENTINEL);
      expect(item.body, item.url).not.toContain(SOLUTION_SENTINEL);
    }
  });

  for (const slug of [
    "e2e-find-symbol",
    "e2e-find-file",
    "e2e-find-location",
    "e2e-trace-sequence",
    "e2e-arch-set",
    "e2e-arch-choice",
  ]) {
    test(`${slug}: no key fields in the page, RSC payloads or API`, async ({ page }) => {
      const captured = capture(page);
      await page.goto(`/puzzles/${slug}`);
      await expect(page.getByTestId("file-tree")).toBeVisible();
      await page.waitForLoadState("networkidle");

      const appData = captured.filter(isAppData);
      expect(appData.some((item) => item.contentType.includes("html"))).toBe(true);
      for (const item of appData) {
        for (const marker of KEY_FIELD_MARKERS) {
          expect(item.body, `${marker} in ${item.url}`).not.toContain(marker);
        }
        expect(item.body, item.url).not.toContain(SOLUTION_SENTINEL);
      }
    });
  }

  test("the puzzle API has no key, and the choice has no correct flag", async ({ request }) => {
    const response = await request.get("/api/puzzles/e2e-arch-choice");
    const text = await response.text();
    for (const marker of KEY_FIELD_MARKERS) expect(text).not.toContain(marker);
    const body = JSON.parse(text) as { choices: Record<string, unknown>[] };
    for (const choice of body.choices) expect(Object.keys(choice).sort()).toEqual(["id", "label"]);
  });

  test("a wrong submission only says it's wrong, and the solution stays locked", async ({ page }) => {
    const captured = capture(page);
    await openPuzzle(page, "e2e-sentinel");
    await signIn(page);
    await openFile(page, FILES.router);
    await page.locator('[data-testid="outline-pick"][data-symbol="src/router.ts#Router"]').click();
    await submitAndExpect(page, false);
    await page.waitForLoadState("networkidle");

    const submit = captured.find((item) => item.url.endsWith("/submit"));
    expect(submit).toBeDefined();
    expect(Object.keys(JSON.parse(submit?.body ?? "{}") as object).sort()).toEqual([
      "achievements",
      "attempts",
      "challenges",
      "correct",
      "pointsAwarded",
    ]);
    for (const item of captured) {
      expect(item.body, item.url).not.toContain(KEY_SENTINEL);
      expect(item.body, item.url).not.toContain(SOLUTION_SENTINEL);
    }
    const locked = await page.request.get("/api/puzzles/e2e-sentinel/solution");
    expect(locked.status()).toBe(403);
  });
});
