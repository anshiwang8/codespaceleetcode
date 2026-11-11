import { expect, test } from "@playwright/test";
import { clickToken, cursorOnSymbol, expectOpenFile, FILES, openFile, openPuzzle, signIn, visible } from "./helpers";

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

  // Playwright's Desktop Chrome profile reports a Windows user agent, so Monaco expects Ctrl even when
  // the suite runs on macOS. A real Mac browser uses Cmd.
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

  test("find references lists every file, even across many", async ({ page }) => {
    // More files than Monaco's listener-leak heuristic allows models for, which must stay quiet.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const paths = Array.from({ length: 250 }, (_, index) => `generated/file${index}.ts`);
    await page.route("**/api/snapshots/*/symbols?*", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { symbol: unknown; references: unknown[] };
      if (body.symbol) {
        body.references = paths.map((file) => ({ file, line: 1, col: 1, endCol: 4 }));
      }
      await route.fulfill({ response, json: body });
    });
    await page.route("**/files/generated/**", (route) => route.fulfill({ contentType: "text/plain", body: "use(thing);" }));

    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.views);
    await cursorOnSymbol(page, "export function renderNotFound", "renderNotFound", "src/views.ts#renderNotFound");
    await expect(page.getByTestId("find-references")).toHaveText("References");
    await page.getByTestId("find-references").click();
    await expect(page.locator(".peekview-widget .head")).toContainText("References (251)"); // And the definition.
    expect(errors).toEqual([]);
  });

  // The server says when it cut the list short. A full list of exactly 500 isn't cut short.
  for (const [truncated, label] of [
    [true, "References (first 500)"],
    [false, "References"],
  ] as const) {
    test(`500 references with referencesTruncated ${truncated} show "${label}"`, async ({ page }) => {
      await page.route("**/api/snapshots/*/symbols?*", async (route) => {
        const response = await route.fetch();
        const body = (await response.json()) as { symbol: unknown; references: unknown[]; referencesTruncated: boolean };
        if (body.symbol) {
          body.references = Array.from({ length: 500 }, (_, index) => ({
            file: FILES.views,
            line: 1,
            col: index + 1,
            endCol: index + 2,
          }));
          body.referencesTruncated = truncated;
        }
        await route.fulfill({ response, json: body });
      });
      await openPuzzle(page, "e2e-find-symbol");
      await openFile(page, FILES.views);
      await cursorOnSymbol(page, "export function renderNotFound", "renderNotFound", "src/views.ts#renderNotFound");
      await expect(page.getByTestId("find-references")).toHaveText(label);
    });
  }

  test("hovering a name shows its symbol from the index", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await openFile(page, FILES.router);
    const line = page.locator(".monaco-editor .view-line", { hasText: "this.match" }).first();
    await line.locator("span", { hasText: /^match$/ }).last().hover();
    await expect(page.locator(".monaco-hover").filter({ visible: true }).first()).toContainText(
      "src/router.ts#Router.match",
    );
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
    // Not a count of failures: if the viewer mounts just as the file is clicked, React's strict mode
    // runs its load twice in development, and the second, successful fetch would hide the error.
    let broken = true;
    await page.route("**/snapshots/**/files/src/views.ts", async (route) => {
      if (broken) await route.fulfill({ status: 500, body: "nope" });
      else await route.continue();
    });
    await openPuzzle(page, "e2e-find-symbol");
    await page.locator('[data-testid="tree-dir"][data-path="src"]').click();
    await page.locator(`[data-testid="tree-file"][data-path="${FILES.views}"]`).click();
    const error = page.getByTestId("file-error");
    await expect(error).toContainText("couldn't be loaded");
    broken = false;
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

  // `next dev` mounts the viewer's effects twice, so two model stores fetch the README. When the
  // first, discarded store's fetch finished last, it used to adopt the second store's model and
  // dispose it, leaving a blank editor, and later files opened blank too.
  test("a file still shows when a discarded load of it finishes last", async ({ page }) => {
    let first = true;
    await page.route("**/snapshots/**/files/README.md", async (route) => {
      if (first) {
        first = false;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });
    await openPuzzle(page, "e2e-find-symbol");
    await expectOpenFile(page, "README.md");
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("acme");
    // Past the delayed fetch, so a late dispose would already have happened.
    await page.waitForTimeout(2000);
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("acme");
    await openFile(page, FILES.views);
    await expect(page.locator(".monaco-editor .view-lines").first()).toContainText("renderNotFound");
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
    // Read straight after navigating, while hydration can briefly leave a hidden second copy.
    await expect(visible(page, "agent-only-note")).toContainText("No person has checked");
    await openPuzzle(page, "e2e-find-file");
    await expect(page.getByTestId("agent-only-note")).toHaveCount(0);
  });

  test("hints come one at a time", async ({ page }) => {
    await openPuzzle(page, "e2e-find-symbol");
    await signIn(page);
    const hints = page.getByTestId("hint");
    await expect(hints).toHaveCount(0);
    await page.getByRole("button", { name: "Reveal hint 1" }).click();
    await expect(hints).toHaveCount(1);
    await page.getByRole("button", { name: "Reveal hint 2" }).click();
    await expect(hints).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^Reveal hint/ })).toHaveCount(0);
  });

  test("the page and Monaco are white, whatever the system's light or dark setting", async ({ page }) => {
    const colors = () =>
      page.evaluate(() => ({
        body: getComputedStyle(document.body).backgroundColor,
        editor: getComputedStyle(document.querySelector(".monaco-editor .monaco-editor-background") as Element)
          .backgroundColor,
      }));
    const white = { body: "rgb(255, 255, 255)", editor: "rgb(255, 255, 255)" };
    await page.emulateMedia({ colorScheme: "dark" });
    await openPuzzle(page, "e2e-find-symbol");
    await page.locator(".monaco-editor .view-line").first().waitFor();
    await expect.poll(colors).toEqual(white);
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(colors).toEqual(white);
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

  test("an unknown puzzle says so, with a 404", async ({ page }) => {
    for (const slug of ["no-such-puzzle", "Not%20A%20Slug"]) {
      const response = await page.goto(`/puzzles/${slug}`);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    }
  });

  test("a real puzzle is a 200", async ({ page }) => {
    const response = await page.goto("/puzzles/e2e-find-symbol");
    expect(response?.status()).toBe(200);
  });
});
