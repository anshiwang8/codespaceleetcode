// Scores every theme for how badly its page background clashes with the fixed cream illustration
// plate and the mascot's colors (design spec section H), and writes a contact sheet and a list to
// docs/superpowers/specs/assets/. Run from web/: `node scripts/theme-clash.mjs`.
//
// It derives every theme from the source palettes, including the ones lib/themes/removed.ts has
// taken out of the catalog, so a removal can be reviewed and reversed. It changes nothing else:
// removing a theme means adding a line to removed.ts and regenerating the catalog.
//
// The test itself is clashOf in lib/themes/clash.ts, where its limits are explained;
// web/tests/themes.test.ts checks removed.ts against it. A score of 1 or more is a clash.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// The theme modules are TypeScript with extensionless imports; Node strips the types itself.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "..");
const lib = (name) => import(path.join(web, "lib/themes", name));
const { clashOf } = await lib("clash.ts");
const { deriveTheme, DEFAULT_DARK_SOURCE, DEFAULT_LIGHT_TOKENS } = await lib("derive.ts");
const { THEME_NAMES, themeIdFor } = await lib("names.ts");
const { REMOVED_THEMES } = await lib("removed.ts");

// The fixed colors, from the "Craft foundation" block of app/globals.css.
const PLATE = "#fcf7f2"; // --plate: oklch(0.977 0.008 70)
const MASCOT = { body: "#8e8ff0", mint: "#86f0c2", ink: "#141845" };

const sources = JSON.parse(readFileSync(path.join(root, "docs/themes/monkeytype-presets.json"), "utf8"));
const dark = deriveTheme(DEFAULT_DARK_SOURCE);
const themes = [
  { id: "default-light", name: "codebases Light", key: null, tokens: DEFAULT_LIGHT_TOKENS },
  { id: "default-dark", name: "codebases Dark", key: null, tokens: dark.tokens },
  // The catalog also shifts the accent of a few presets that share a palette; the sheet doesn't,
  // since only the background is scored.
  ...Object.entries(sources).map(([key, palette]) => ({ id: themeIdFor(key), name: THEME_NAMES[key], key, tokens: deriveTheme(palette).tokens })),
];

const rows = themes
  .map((theme) => {
    const removed = theme.key !== null && theme.key in REMOVED_THEMES;
    return { ...theme, ...clashOf(theme.tokens.bg), removed };
  })
  .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

// The contact sheet: each theme's page with a raised strip, its accent, and the cream plate
// carrying the mascot's periwinkle, mint and navy.
const COLUMNS = 7;
const TILE = { w: 250, h: 150, gap: 10 };
const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const tiles = rows.map((row, index) => {
  const x = TILE.gap + (index % COLUMNS) * (TILE.w + TILE.gap);
  const y = TILE.gap + Math.floor(index / COLUMNS) * (TILE.h + TILE.gap);
  const t = row.tokens;
  const mark = row.removed ? "REMOVED" : row.clash ? "CLASH, KEPT" : "";
  return `<g transform="translate(${x} ${y})" font-family="Helvetica, Arial, sans-serif">
    <rect width="${TILE.w}" height="${TILE.h}" rx="10" fill="${t.bg}" stroke="${row.removed ? "#e11d48" : "#9ca3af"}" stroke-width="${row.removed ? 4 : 1}"/>
    <rect x="12" y="104" width="${TILE.w - 24}" height="34" rx="6" fill="${t["panel-raised"]}"/>
    <rect x="20" y="113" width="52" height="16" rx="5" fill="${t.accent}"/>
    <text x="82" y="125" font-size="11" fill="${t["text-muted"]}">${row.id}</text>
    <text x="12" y="24" font-size="14" font-weight="700" fill="${t.text}">${escape(row.name)}</text>
    <text x="12" y="42" font-size="12" fill="${t["text-muted"]}">score ${row.score.toFixed(2)}</text>
    ${mark ? `<rect x="12" y="52" width="${mark.length * 7.2 + 14}" height="18" rx="4" fill="#e11d48"/><text x="19" y="65" font-size="11" font-weight="700" fill="#ffffff">${mark}</text>` : ""}
    <rect x="118" y="34" width="120" height="62" rx="8" fill="${PLATE}"/>
    <circle cx="146" cy="65" r="15" fill="${MASCOT.body}" stroke="${MASCOT.ink}" stroke-width="3"/>
    <circle cx="180" cy="65" r="15" fill="${MASCOT.mint}" stroke="${MASCOT.ink}" stroke-width="3"/>
    <circle cx="214" cy="65" r="15" fill="${MASCOT.ink}"/>
  </g>`;
});
const width = TILE.gap + COLUMNS * (TILE.w + TILE.gap);
const height = TILE.gap + Math.ceil(rows.length / COLUMNS) * (TILE.h + TILE.gap);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e5e7eb"/>${tiles.join("")}</svg>`;

const out = path.join(root, "docs/superpowers/specs/assets");
mkdirSync(out, { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(path.join(out, "theme-clash.png"));

const removed = rows.filter((row) => row.removed);
const disagree = rows.filter((row) => row.clash !== row.removed && row.key !== null);
const list = [
  "# Theme clash list",
  "",
  "Written by `web/scripts/theme-clash.mjs` (run `node scripts/theme-clash.mjs` in `web/`). The contact sheet is `theme-clash.png`, in the same order: highest score first.",
  "",
  `${rows.length} themes scored, ${removed.length} removed, ${rows.length - removed.length} kept. A score of 1 or more is a clash.`,
  "",
  "The test is `clashOf` in `web/lib/themes/clash.ts`, on the page background in OKLCH. Below lightness 0.20 a background never clashes, and neither does a dark one (lightness below 0.50) in the mascot's blue-violet family (hue within 45 degrees of 278). Any other dark background clashes at chroma 0.12 or more; a light warm one (hue within 60 degrees of the plate's 70) at 0.10 or more; any other light one at 0.06 or more. The score is the chroma divided by that limit.",
  "",
  "To bring a theme back, delete its line in `web/lib/themes/removed.ts` and run `UPDATE_THEMES=1 npx vitest run tests/themes.test.ts` in `web/`.",
  "",
  disagree.length > 0
    ? `The list and the test disagree on: ${disagree.map((row) => `\`${row.id}\``).join(", ")}.`
    : "The removed list and the test agree on every theme.",
  "",
  "| ID | Name | Background | Score | Status | Reason |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map((row) => {
    const reason = row.removed ? REMOVED_THEMES[row.key] : row.reason;
    return `| \`${row.id}\` | ${row.name} | \`${row.tokens.bg}\` | ${row.score.toFixed(2)} | ${row.removed ? "removed" : "kept"} | ${reason} |`;
  }),
  "",
].join("\n");
writeFileSync(path.join(out, "theme-clash.md"), list);

console.log(`${rows.length} themes, ${rows.filter((row) => row.clash).length} clash by the test, ${removed.length} removed.`);
for (const row of rows.filter((item) => item.clash || item.removed)) {
  console.log(`${row.removed ? "removed" : "clash  "}  ${row.score.toFixed(2)}  ${row.id}  ${row.name}  ${row.tokens.bg}`);
}
