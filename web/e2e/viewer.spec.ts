import { expect, test } from "@playwright/test";
import { clickToken, cursorOnSymbol, expectOpenFile, FILES, openFile, openPuzzle } from "./helpers";

test.describe("code viewer", () => {
  test("F12 jumps across files, and the tree, tabs and trail follow", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.router);
    await cursorOnSymbol(page, "return renderNotFound", "renderNotFound", "src/views.ts#renderNotFound");
    await page.keyboard.press("F12");

    await expectOpenFile(page, FILES.views);
    await expect(page.locator(`[data-testid="editor-tab"][data-path="${FILES.router}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="editor-tab"][data-path="${FILES.views}"]`)).toBeVisible();
    await expect(page.getByTestId("trail-item").last()).toHaveAttribute("data-path", FILES.views);
    // The cursor lands on the definition, and the outline moved to the new file.
    await expect(page.getByTestId("cursor-symbol")).toHaveText("src/views.ts#renderNotFound");
    await expect(
      page.locator('[data-testid="outline-row"][data-symbol="src/views.ts#renderHome"]'),
    ).toBeVisible();

    // Back through the trail.
    await page.locator(`[data-testid="trail-item"][data-path="${FILES.router}"]`).click();
    await expectOpenFile(page, FILES.router);
  });

  test("ctrl-click jumps across files too", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.index);
    await clickToken(page, "logRequest(path);", "logRequest", { modifiers: ["Control"] });
    await expectOpenFile(page, "src/logging/logger.ts");
    await expect(page.locator('[data-testid="tree-dir"][data-path="src/logging"]')).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("find references shows the index's references, and opening one switches files", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.views);
    await cursorOnSymbol(page, "export function renderNotFound", "renderNotFound", "src/views.ts#renderNotFound");
    await page.getByTestId("find-references").click();

    const peek = page.locator(".peekview-widget");
    await expect(peek).toBeVisible();
    await expect(peek).toContainText("router.ts");
    // Monaco expands the file you're in, so open the other file's group first.
    await peek.locator(".monaco-list-row", { hasText: "router.ts" }).click();
    await peek.locator(".monaco-list-row", { hasText: "return" }).dblclick();
    await expectOpenFile(page, FILES.router);
  });

  test("hovering a name shows its symbol from the index", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.router);
    const line = page.locator(".monaco-editor .view-line", { hasText: "this.match" }).first();
    await line.locator("span", { hasText: /^match$/ }).last().hover();
    await expect(page.locator(".monaco-hover")).toContainText("src/router.ts#Router.match");
  });

  test("a local variable has no symbol, and nothing goes wrong", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.router);
    await clickToken(page, "const trimmed", "trimmed");
    await expect(page.getByTestId("cursor-symbol-none")).toHaveText("No indexed symbol at the cursor.");
    await expect(page.getByTestId("pick-cursor-symbol")).toHaveCount(0);
    await expect(page.getByTestId("go-to-definition")).toBeDisabled();
    await page.keyboard.press("F12");
    await expect(page.getByTestId("code-viewer")).toHaveAttribute("data-shown-path", FILES.router);
    expect(errors).toEqual([]);
  });

  test("a CRLF file keeps its line numbers and its symbols line up", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.windows);
    // Line 5 in a file with CRLF endings: a miscount would land on the wrong line or no symbol.
    await cursorOnSymbol(page, "export const CRLF_DONE", "crlfHelper", "src/windows.ts#crlfHelper");
    await page.keyboard.press("F12");
    await expect(page.getByTestId("cursor-symbol")).toHaveText("src/windows.ts#crlfHelper");
    await expect(page.locator(".monaco-editor .line-numbers.active-line-number")).toHaveText("1");
  });

  test("a CRLF file gives the same location ID as any other", async ({ page }) => {
    await openPuzzle(page, "e2e-find-location");
    await openFile(page, FILES.windows);
    await clickToken(page, "export const CRLF_DONE", "CRLF_DONE");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await expect(page.getByTestId("selection-id")).toHaveText("src/windows.ts:L5-L5");
  });

  test("a very large file opens, with highlighting off and a note saying so", async ({ page }) => {
    const manifestPattern = "**/snapshots/**/manifest.json";
    await page.route(manifestPattern, async (route) => {
      const response = await route.fetch();
      const manifest = (await response.json()) as { files: { path: string }[] };
      manifest.files.push({ path: "big.js", size: 900_000, language: "javascript" } as never);
      await route.fulfill({ response, json: manifest });
    });
    await page.route("**/snapshots/**/files/big.js", (route) =>
      route.fulfill({
        contentType: "text/plain",
        body: Array.from({ length: 20_000 }, (_, i) => `const value${i} = ${i}; // padding padding padding`).join("\r\n"),
      }),
    );
    await openPuzzle(page, "e2e-find-symbol");
    await page.locator('[data-testid="tree-file"][data-path="big.js"]').click();
    await expect(page.getByTestId("code-viewer")).toHaveAttribute("data-shown-path", "big.js");
    await expect(page.getByTestId("large-file-notice")).toBeVisible();
    await expect(page.locator(".monaco-editor .view-line", { hasText: "value0" })).toBeVisible();
  });

  test("a binary file says so instead of rendering", async ({ page }) => {
    await page.route("**/snapshots/**/manifest.json", async (route) => {
      const response = await route.fetch();
      const manifest = (await response.json()) as { files: unknown[] };
      manifest.files.push({ path: "logo.bin", size: 4, language: "other" });
      await route.fulfill({ response, json: manifest });
    });
    await page.route("**/snapshots/**/files/logo.bin", (route) =>
      route.fulfill({ contentType: "text/plain", body: Buffer.from([65, 0, 66, 0]) }),
    );
    await openPuzzle(page, "e2e-find-symbol");
    await page.locator('[data-testid="tree-file"][data-path="logo.bin"]').click();
    await expect(page.getByTestId("file-error")).toContainText("binary file");
  });

  test("a file that fails to load offers a retry that works", async ({ page }) => {
    let failures = 1;
    await page.route("**/snapshots/**/files/src/views.ts", async (route) => {
      if (failures > 0) {
        failures -= 1;
        await route.fulfill({ status: 500, body: "nope" });
      } else {
        await route.continue();
      }
    });
    await openPuzzle(page, "e2e-find-symbol");
    await page.locator('[data-testid="tree-dir"][data-path="src"]').click();
    await page.locator(`[data-testid="tree-file"][data-path="${FILES.views}"]`).click();
    const error = page.getByTestId("file-error");
    await expect(error).toContainText("couldn't be loaded");
    await error.getByRole("button", { name: "Try again" }).click();
    await expectOpenFile(page, FILES.views);
  });

  test("a missing manifest shows an error with a retry", async ({ page }) => {
    // Not a count of failures: React's strict mode runs the fetch twice in development.
    let broken = true;
    await page.route("**/snapshots/**/manifest.json", async (route) => {
      if (broken) await route.fulfill({ status: 404, body: "{}" });
      else await route.continue();
    });
    await page.goto("/puzzles/e2e-find-symbol");
    const error = page.getByTestId("manifest-error");
    await expect(error).toBeVisible();
    broken = false;
    await error.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator('[data-testid="tree-dir"][data-path="src"]')).toBeVisible();
  });

  test("search finds lines and opens them; the filter narrows the tree", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await page.getByTestId("file-filter").fill("logger");
    await expect(page.locator('[data-testid="tree-file"][data-path="src/logging/logger.ts"]')).toBeVisible();
    await expect(page.locator(`[data-testid="tree-file"][data-path="${FILES.views}"]`)).toHaveCount(0);
    await page.getByTestId("file-filter").fill("");

    await page.getByRole("tab", { name: "Search" }).click();
    await page.getByTestId("search-input").fill("maxHeaderBytes");
    const match = page.getByTestId("search-match");
    await expect(match).toHaveCount(1);
    await match.click();
    await expectOpenFile(page, FILES.config);
    await expect(page.locator(".monaco-editor .line-numbers.active-line-number")).toHaveText("5");

    await page.getByTestId("search-input").fill("zzz-not-there");
    await expect(page.getByTestId("search-empty")).toBeVisible();
    await page.getByTestId("search-input").fill("x");
    await expect(page.getByTestId("search-results")).toContainText("at least 2");
  });

  test("Monaco comes from this server, never a CDN", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (["http:", "https:"].includes(url.protocol) && url.hostname !== "127.0.0.1") {
        external.push(request.url());
      }
    });
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.router);
    expect(external).toEqual([]);
  });
});

test.describe("puzzle page furniture", () => {
  test("attribution is always there and links to GitHub at the SHA", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    const attribution = page.getByTestId("attribution");
    await expect(attribution).toBeInViewport();
    await expect(attribution).toContainText("acme-tiny");
    await expect(attribution).toContainText("MIT");
    await expect(page.getByTestId("attribution-sha")).toHaveAttribute(
      "title",
      "0123456789abcdef0123456789abcdef01234567",
    );
    await expect(page.getByTestId("attribution-link")).toHaveAttribute(
      "href",
      "https://github.com/example/acme-tiny/tree/0123456789abcdef0123456789abcdef01234567",
    );
  });

  test("the unverified note follows verifiedBy", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await expect(page.getByTestId("agent-only-note")).toContainText("No person has checked");
    await openPuzzle(page, "e2e-find-file");
    await expect(page.getByTestId("agent-only-note")).toHaveCount(0);
  });

  test("hints come one at a time", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await expect(page.getByTestId("hint")).toHaveCount(0);
    await page.getByRole("button", { name: "Show a hint" }).click();
    await expect(page.getByTestId("hint")).toHaveCount(1);
    await page.getByRole("button", { name: "Show the next hint" }).click();
    await expect(page.getByTestId("hint")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /hint/ })).toHaveCount(0);
  });

  test("the page and Monaco follow the system's light or dark setting", async ({ page }) => {
    const colors = () =>
      page.evaluate(() => ({
        body: getComputedStyle(document.body).backgroundColor,
        editor: getComputedStyle(document.querySelector(".monaco-editor .monaco-editor-background") as Element)
          .backgroundColor,
      }));
    await openPuzzle(page, "e2e-find-symbol");
    await page.locator(".monaco-editor .view-line").first().waitFor();
    await expect.poll(colors).toEqual({ body: "rgb(12, 14, 16)", editor: "rgb(16, 19, 22)" });
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(colors).toEqual({ body: "rgb(242, 240, 235)", editor: "rgb(253, 252, 250)" });
  });

  test("panels resize by dragging and by keyboard", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    const splitter = page.getByRole("separator", { name: "Resize the prompt panel" });
    await expect(splitter).toHaveAttribute("aria-valuenow", "290");
    await splitter.focus();
    await page.keyboard.press("ArrowRight");
    await expect(splitter).toHaveAttribute("aria-valuenow", "314");
    const box = await splitter.boundingBox();
    if (!box) throw new Error("No splitter box");
    await page.mouse.move(box.x + 2, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 42, box.y + 100);
    await page.mouse.up();
    await expect(splitter).toHaveAttribute("aria-valuenow", "354");
  });

  test("no field in the answer tray takes typing", async ({ page }) => {
    for (const slug of ["e2e-find-symbol", "e2e-find-file", "e2e-find-location", "e2e-trace-sequence", "e2e-arch-set"]) {
      await openPuzzle(page, slug);
      await expect(page.getByTestId("answer-tray").locator("input, textarea, [contenteditable]")).toHaveCount(0);
    }
    await openPuzzle(page, "e2e-arch-choice");
    await expect(page.getByTestId("answer-tray").locator('input:not([type="radio"]), textarea, [contenteditable]')).toHaveCount(0);
  });

  test("an unknown puzzle says so", async ({ page }) => {
    // The status is 200, because loading.tsx starts streaming before the page knows it's missing.
    await page.goto("/puzzles/no-such-puzzle");
    await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  });
});
