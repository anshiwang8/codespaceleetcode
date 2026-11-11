// Writes the static brand files from the mark's geometry in components/site/mark.ts:
//   app/icon.svg                         the favicon
//   app/apple-icon.png                   180×180, full bleed (iOS rounds the corners itself)
//   public/brand/mark-{light,dark}.svg   the mark alone
//   public/brand/logo-{light,dark}.svg   the mark and the word
//   public/brand/icon-{192,512}.png      the web app manifest's icons (app/manifest.ts)
//   public/brand/icon-maskable-512.png   full bleed, for platforms that crop icons to a shape
//
// Run from web/ after changing the mark or the default themes' accent, text or accent ink:
//   node scripts/brand-icons.mjs
// Needs a Node that runs TypeScript directly (22.18 or later), since it imports mark.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { MARK_SIZE, markSvgBody } from "../components/site/mark.ts";

const root = new URL("../", import.meta.url);
const out = (path) => new URL(path, root);

// The two default themes' colors, read from the generated catalog, so the files match the site.
const catalog = readFileSync(out("lib/themes/catalog.generated.ts"), "utf8");
const theme = (id) => {
  const line = catalog.split("\n").find((text) => text.trim().startsWith(`{"id":"${id}"`));
  if (!line) throw new Error(`No theme ${id} in the catalog`);
  return JSON.parse(line.trim().replace(/,$/, "")).tokens;
};
const SCHEMES = {
  light: theme("default-light"),
  dark: theme("default-dark"),
};

// The word, as in components/site/logo.module.css: the UI font stack, bold, tracked in by 0.03em,
// 1/1.4 of the mark's height, 0.42em after it. textLength holds the measured width of
// system-ui bold, so a fallback font keeps the same layout.
const FONT = `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const FONT_SIZE = 23;
const WORD_X = 41.75;
const WORD_WIDTH = 108.75;
const BASELINE = 24.25;
const LOCKUP_WIDTH = Math.ceil(WORD_X + WORD_WIDTH + 2);

const svg = (width, height, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">` +
  `<title>${title}</title>${body}</svg>\n`;

const mark = (tokens, options = {}) => markSvgBody({ tile: tokens.accent, ink: tokens["accent-ink"], ...options });

const lockup = (tokens) =>
  svg(
    LOCKUP_WIDTH,
    MARK_SIZE,
    mark(tokens) +
      `<text x="${WORD_X}" y="${BASELINE}" fill="${tokens.text}" font-family="${FONT}" font-size="${FONT_SIZE}" ` +
      `font-weight="700" letter-spacing="-0.69" textLength="${WORD_WIDTH}" lengthAdjust="spacing">codebases</text>`,
    "codebases",
  );

mkdirSync(out("public/brand/"), { recursive: true });

const files = {
  "app/icon.svg": svg(MARK_SIZE, MARK_SIZE, mark(SCHEMES.light), "codebases"),
  "public/brand/mark-light.svg": svg(MARK_SIZE, MARK_SIZE, mark(SCHEMES.light), "codebases"),
  "public/brand/mark-dark.svg": svg(MARK_SIZE, MARK_SIZE, mark(SCHEMES.dark), "codebases"),
  "public/brand/logo-light.svg": lockup(SCHEMES.light),
  "public/brand/logo-dark.svg": lockup(SCHEMES.dark),
};
for (const [path, text] of Object.entries(files)) {
  writeFileSync(out(path), text);
  console.log(`wrote ${path}`);
}

// PNGs are rendered from the same SVG at a high density, then resized, so edges stay crisp.
async function png(path, size, body) {
  const source = Buffer.from(svg(MARK_SIZE, MARK_SIZE, body, "codebases"));
  await sharp(source, { density: Math.ceil((72 * size * 4) / MARK_SIZE) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(out(path)));
  console.log(`wrote ${path}`);
}

await png("app/apple-icon.png", 180, mark(SCHEMES.light, { bleed: true }));
await png("public/brand/icon-192.png", 192, mark(SCHEMES.light));
await png("public/brand/icon-512.png", 512, mark(SCHEMES.light));
await png("public/brand/icon-maskable-512.png", 512, mark(SCHEMES.light, { bleed: true }));
