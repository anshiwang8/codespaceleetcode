// Recaptures the landing page's workspace screenshots, public/landing/workspace-{light,dark}.png.
//
// Run against a local site with the real puzzles seeded, from web/:
//   PORT=3100 pnpm local            (in the repository root, in another terminal)
//   node scripts/capture-landing.mjs http://127.0.0.1:3100
//
// It opens hono-trace-002 signed out, opens src/context.ts at Context.redirect, and adds only that
// symbol, the chain's start, which the prompt names, to the answer. Never capture more of an answer.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3100";
const SLUG = "hono-trace-002";
const FILE = "src/context.ts";
const SYMBOL = "Context.redirect";
const WORD = "redirect";

// The two default themes' tokens, read from the generated catalog.
const catalog = readFileSync(new URL("../lib/themes/catalog.generated.ts", import.meta.url), "utf8");
const theme = (id) => {
  const line = catalog.split("\n").find((text) => text.trim().startsWith(`{"id":"${id}"`));
  if (!line) throw new Error(`No theme ${id} in the catalog`);
  return JSON.parse(line.trim().replace(/,$/, ""));
};

const browser = await chromium.launch();
try {
  for (const [id, name] of [
    ["default-light", "light"],
    ["default-dark", "dark"],
  ]) {
    const { scheme, tokens } = theme(id);
    const context = await browser.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([themeId, themeScheme, vars]) => {
        localStorage.setItem("cb-theme-guest", JSON.stringify({ mode: "theme", id: themeId }));
        localStorage.setItem(
          "cb-theme",
          JSON.stringify({ v: 1, preference: { mode: "theme", id: themeId }, theme: { scheme: themeScheme, vars } }),
        );
      },
      [id, scheme, tokens],
    );
    const page = await context.newPage();
    await page.goto(`${base}/puzzles/${SLUG}`);
    await page.getByTestId("file-tree").waitFor();
    const parts = FILE.split("/");
    for (let index = 1; index < parts.length; index++) {
      await page.locator(`[data-testid="tree-dir"][data-path="${parts.slice(0, index).join("/")}"]`).click();
    }
    await page.locator(`[data-testid="tree-file"][data-path="${FILE}"]`).click();
    await page.locator(".monaco-editor .view-lines").first().waitFor();
    await page.locator(`[data-testid="outline-row"][data-symbol$="#${SYMBOL}"] button`).first().click();
    await page.waitForTimeout(800);

    // Put the cursor on the symbol's name (Monaco renders spaces as no-break spaces, which \s matches).
    const line = page.locator(".monaco-editor .view-line").filter({ hasText: new RegExp(`${WORD}\\s=\\s<`) }).first();
    const point = await line.evaluate((element, word) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent.indexOf(word);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at + 2);
        range.setEnd(node, at + 3);
        const box = range.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }
      return null;
    }, WORD);
    if (!point) throw new Error(`Couldn't find ${WORD} in the editor`);
    await page.mouse.click(point.x, point.y);
    await page.getByTestId("pick-cursor-symbol").click();
    await page.waitForTimeout(800);
    await page.mouse.move(0, 0);

    // Below the site header, which isn't part of the workspace.
    const out = new URL(`../public/landing/workspace-${name}.png`, import.meta.url).pathname;
    await page.screenshot({ path: out, clip: { x: 0, y: 56, width: 1440, height: 804 } });
    await context.close();
    console.log(`Wrote ${out}`);
  }
} finally {
  await browser.close();
}
