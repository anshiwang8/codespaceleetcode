import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { THEMES } from "../lib/themes/catalog.generated";
import type { ThemeDefinition } from "../lib/themes/tokens";
import { browserIssues, denseActivity, fixtureAccount, ready, settled } from "./visual-helpers";

// Opt-in, like the rest of the gallery.
test.skip(!process.env.VISUAL_REVIEW, "Run pnpm visual:review");
const phase = process.env.VISUAL_PHASE === "before" ? "before" : "after";
const directory = path.resolve("visual-review", phase, "themes");

/**
 * Representative palettes: both defaults, a saturated dark theme, a very dark one, a light one
 * whose background was moved away from mid-gray, a dark one moved the same way, and a light theme
 * whose accent needed the biggest change.
 */
const REPRESENTATIVE = ["default-light", "default-dark", "dracula", "arch", "botanical", "diner", "beach"] as const;

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** One card per theme, drawn only from its tokens: the same pairs the app uses. */
function card(theme: ThemeDefinition): string {
  const t = theme.tokens;
  const heat = [0, 1, 2, 3, 4].map((level) => `<i style="background:${t[`heat-${level}` as "heat-0"]}"></i>`).join("");
  return `<figure style="background:${t.bg};color:${t.text};border:1px solid ${t["line-strong"]}">
    <header style="background:${t["panel-raised"]};border-bottom:1px solid ${t.line}">
      <b>${escape(theme.name)}</b><small style="color:${t["text-faint"]}">${theme.id} · ${theme.scheme}</small>
    </header>
    <div class="row">
      <span class="avatar" style="background:${t["avatar-bg"]}"><svg viewBox="0 0 64 64" fill="${t["avatar-fg"]}"><circle cx="32" cy="24.5" r="11"/><path d="M11 55.5c0-11.3 9.4-19 21-19s21 7.7 21 19v2.5H11z"/></svg></span>
      <span style="color:${t["text-muted"]}">Secondary text</span>
      <a style="color:${t["accent-text"]}">Link</a>
    </div>
    <div class="row">
      <span class="btn" style="background:${t.accent};color:${t["accent-ink"]}">Submit</span>
      <span class="btn" style="background:${t["bad-fill"]};color:${t["bad-ink"]}">Delete</span>
      <span class="chip" style="background:${t["accent-soft"]};color:${t["accent-text"]}">Picked</span>
    </div>
    <div class="row">
      <span class="chip" style="background:${t["ok-soft"]};color:${t.ok}">Correct</span>
      <span class="chip" style="background:${t["warn-soft"]};color:${t.warn}">Hint</span>
      <span class="chip" style="background:${t["bad-soft"]};color:${t.bad}">Wrong</span>
      <span class="heat">${heat}</span>
    </div>
    <pre style="background:${t["editor-bg"]};border-top:1px solid ${t.line}"><span style="color:${t["editor-line-number"]}">12</span> <span style="color:${t["syntax-keyword"]}">export</span> <span style="color:${t["syntax-keyword"]}">function</span> <span style="color:${t["syntax-function"]}">route</span>(<span style="color:${t["syntax-type"]}">Path</span>) {
<span style="color:${t["editor-line-number"]}">13</span>   <span style="color:${t["syntax-comment"]}">// matches</span> <span style="color:${t["syntax-string"]}">"/users"</span> <span style="color:${t["syntax-number"]}">404</span></pre>
  </figure>`;
}

const SHEET_STYLE = `
  body{margin:16px;background:#d4d4d8;font:13px/1.35 system-ui,sans-serif}
  main{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  figure{margin:0;border-radius:8px;overflow:hidden}
  header{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:6px 10px}
  header b{font-size:14px} small{font-size:11px}
  .row{display:flex;align-items:center;gap:8px;padding:6px 10px}
  .avatar{width:22px;height:22px;border-radius:50%;overflow:hidden;display:inline-flex}
  .avatar svg{width:100%;height:100%}
  .btn{padding:3px 10px;border-radius:6px;font-weight:600}
  .chip{padding:2px 8px;border-radius:999px;font-weight:600}
  .heat{display:inline-flex;gap:2px;margin-left:auto} .heat i{width:11px;height:11px;border-radius:2px}
  pre{margin:0;padding:6px 10px;font:12px/1.5 ui-monospace,monospace;white-space:pre}
`;

async function useTheme(page: Page, id: string) {
  const base = test.info().project.use.baseURL ?? "";
  const response = await page.request.put("/api/me/preferences", {
    headers: { origin: base },
    data: { preference: { mode: "theme", id } },
  });
  expect(response.ok()).toBe(true);
}

/** Waits until the page shows this theme: the controller has applied the account's choice. */
async function showing(page: Page, theme: ThemeDefinition) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue("--bg")))
    .toBe(theme.tokens.bg);
}

test("contact sheet of every theme", async ({ page }) => {
  mkdirSync(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const perSheet = 48;
  const sheets: string[] = [];
  for (let start = 0; start < THEMES.length; start += perSheet) {
    const slice = THEMES.slice(start, start + perSheet);
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${SHEET_STYLE}</style><main>${slice.map(card).join("")}</main>`);
    const file = `contact-sheet-${String(sheets.length + 1)}.png`;
    await page.screenshot({ path: path.join(directory, file), fullPage: true });
    sheets.push(file);
  }
  expect(sheets.length).toBe(Math.ceil(THEMES.length / perSheet));
  writeFileSync(path.join(directory, "contact-sheets.json"), JSON.stringify({ themes: THEMES.length, sheets }, null, 2));
});

for (const id of REPRESENTATIVE) {
  test(`key screens in ${id}`, async ({ page }) => {
    test.setTimeout(180_000);
    const theme = THEMES.find((entry) => entry.id === id);
    if (!theme) throw new Error(`Unknown theme ${id}`);
    mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    const issues = browserIssues(page);
    const login = `visual-theme-${id}`;
    await fixtureAccount(page, false, login);
    await denseActivity(login);
    await useTheme(page, id);

    async function capture(name: string, options: { fullPage?: boolean } = {}) {
      await settled(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(directory, `${id}-${name}.png`), fullPage: options.fullPage ?? true, animations: "allow" });
    }

    await page.goto("/puzzles");
    await ready(page);
    await showing(page, theme);
    await capture("puzzles");

    // The static landing page paints from the cached theme.
    await page.goto("/");
    await ready(page);
    await showing(page, theme);
    for (const section of await page.locator("[data-reveal]").all()) {
      await section.scrollIntoViewIfNeeded();
      await settled(page);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture("landing");

    await page.goto("/profile");
    await ready(page);
    await expect(page.getByTestId("activity").filter({ visible: true })).toBeVisible();
    await capture("profile");

    // The Theme button is on the profile page.
    await page.getByTestId("theme-button").filter({ visible: true }).click();
    const dialog = page.getByTestId("theme-dialog");
    await expect(dialog.getByTestId("theme-list").locator("label").first()).toBeVisible();
    await dialog.getByTestId(`theme-option-${id}`).scrollIntoViewIfNeeded();
    await capture("theme-dialog", { fullPage: false });
    await page.keyboard.press("Escape");

    await page.goto("/settings");
    await ready(page);
    await expect(page.getByTestId("details-form")).toBeVisible();
    await page.getByTestId("details-form").getByLabel(/Display name/).fill("Line‮break");
    await page.getByTestId("details-save").click();
    await expect(page.getByTestId("details-status")).toHaveAttribute("role", "alert");
    // That refusal was the point: an inline error, in this theme.
    for (let at = issues.length - 1; at >= 0; at--) if (/\/api\/me\/details|status of 400/.test(issues[at] ?? "")) issues.splice(at, 1);
    await capture("settings");

    await page.goto("/puzzles/e2e-arch-choice");
    await ready(page);
    await expect(page.locator(".monaco-editor .view-line").first()).toBeVisible();
    await page.getByRole("radio", { name: "The router module" }).check();
    await page.getByTestId("submit").click();
    await expect(page.getByTestId("result")).toHaveAttribute("data-correct", "false");
    await capture("workspace", { fullPage: false });

    expect(issues).toEqual([]);
  });
}

for (const id of ["default-light", "dracula"] as const) {
  test(`phone screens in ${id}`, async ({ page }) => {
    const theme = THEMES.find((entry) => entry.id === id);
    if (!theme) throw new Error(`Unknown theme ${id}`);
    mkdirSync(directory, { recursive: true });
    await page.setViewportSize({ width: 375, height: 812 });
    const issues = browserIssues(page);
    await fixtureAccount(page, true, `visual-phone-${id}`);
    await useTheme(page, id);
    await page.goto("/settings");
    await ready(page);
    await showing(page, theme);
    await settled(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(directory, `${id}-settings-375.png`), fullPage: true, animations: "allow" });
    await page.goto("/profile");
    await ready(page);
    await expect(page.getByTestId("profile-identity").filter({ visible: true })).toBeVisible();
    await page.screenshot({ path: path.join(directory, `${id}-profile-375.png`), fullPage: true, animations: "allow" });
    await page.getByTestId("theme-button").filter({ visible: true }).click();
    await expect(page.getByTestId("theme-dialog").getByTestId("theme-list").locator("label").first()).toBeVisible();
    await settled(page);
    await page.screenshot({ path: path.join(directory, `${id}-theme-dialog-375.png`), animations: "allow" });
    expect(issues).toEqual([]);
  });
}
