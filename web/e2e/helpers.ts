import { expect, type Locator, type Page } from "@playwright/test";

export const FILES = {
  index: "src/index.ts",
  router: "src/router.ts",
  views: "src/views.ts",
  config: "src/config.ts",
  windows: "src/windows.ts",
} as const;

/**
 * While a streamed page hydrates, React keeps a hidden copy of the server's HTML for a moment, so a
 * test ID can briefly match twice. Anything read straight after a navigation should use this.
 */
export function visible(page: Page, testId: string): Locator {
  return page.getByTestId(testId).filter({ visible: true });
}

/** Opens a puzzle and waits for the file tree. */
export async function openPuzzle(page: Page, slug: string): Promise<void> {
  await page.goto(`/puzzles/${slug}`);
  await expect(page.getByTestId("file-tree")).toBeVisible();
}

/** Signs in through the header's dev button. Each test's browser context gets its own new user. */
export async function signIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Sign in as dev-/ }).click();
  await expect(page.getByTestId("signed-in-as")).toHaveText(/^dev-/);
}

/** Clicks a file in the tree, expanding the folders above it. */
export async function openFile(page: Page, path: string): Promise<void> {
  const parts = path.split("/");
  for (let depth = 1; depth < parts.length; depth += 1) {
    const dir = page.locator(`[data-testid="tree-dir"][data-path="${parts.slice(0, depth).join("/")}"]`);
    if ((await dir.getAttribute("aria-expanded")) !== "true") await dir.click();
  }
  await page.locator(`[data-testid="tree-file"][data-path="${path}"]`).click();
  await expectOpenFile(page, path);
}

/** Waits until Monaco is showing this file, and the tab and tree agree. */
export async function expectOpenFile(page: Page, path: string): Promise<void> {
  await expect(page.getByTestId("code-viewer")).toHaveAttribute("data-shown-path", path);
  await expect(page.locator(`[data-testid="editor-tab"][aria-selected="true"]`)).toHaveAttribute("data-path", path);
  await expect(page.locator(`[data-testid="tree-file"][aria-current="true"]`)).toHaveAttribute("data-path", path);
  await expect(page.locator(".monaco-editor .view-line").first()).toBeVisible();
}

function editorLine(page: Page, text: string): Locator {
  return page.locator(".monaco-editor .view-line", { hasText: text }).first();
}

/**
 * Where a token's text is on screen. Monaco replaces a line's elements when it re-renders it, for
 * example once tokenizing colours it, so a line found a moment ago can be detached and measure as
 * 0,0. That measurement is retried rather than clicked.
 */
async function measureToken(line: Locator, lineText: string, token: string): Promise<{ x: number; y: number }> {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const box = await line.evaluate((element, wanted) => {
      if (!element.isConnected) return null;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = (node.textContent ?? "").indexOf(wanted);
        if (index === -1) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + wanted.length);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }
      return null;
    }, token);
    if (box) return box;
    if (Date.now() > deadline) throw new Error(`"${token}" isn't rendered on the line containing "${lineText}"`);
    await line.page().waitForTimeout(50);
  }
}

/**
 * Clicks a token in the editor. Monaco renders each token in its own span, and a click lands on the
 * middle of the element, so this measures where the text is inside the line.
 */
export async function clickToken(
  page: Page,
  lineText: string,
  token: string,
  options: { modifiers?: ("Control" | "Shift")[] } = {},
): Promise<void> {
  const line = editorLine(page, lineText);
  await expect(line).toBeVisible();
  const box = await measureToken(line, lineText, token);
  if (options.modifiers) for (const key of options.modifiers) await page.keyboard.down(key);
  await page.mouse.move(box.x, box.y);
  await page.mouse.click(box.x, box.y);
  if (options.modifiers) for (const key of options.modifiers) await page.keyboard.up(key);
}

/** Puts the cursor on a name and waits for the action bar to report the index's symbol for it. */
export async function cursorOnSymbol(page: Page, lineText: string, token: string, symbolId: string): Promise<void> {
  await clickToken(page, lineText, token);
  await expect(page.getByTestId("cursor-symbol")).toHaveText(symbolId);
}

/** Selects whole lines the way a person does with the keyboard, from the start of the first. */
export async function selectLines(page: Page, firstLineToken: string, lineCount: number): Promise<void> {
  await clickToken(page, firstLineToken, firstLineToken);
  await page.keyboard.press("Home");
  await page.keyboard.press("Home");
  for (let index = 0; index < lineCount; index += 1) await page.keyboard.press("Shift+ArrowDown");
}

export async function submitAndExpect(page: Page, correct: boolean): Promise<void> {
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("result")).toHaveAttribute("data-correct", String(correct));
}
