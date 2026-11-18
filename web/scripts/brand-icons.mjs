// Writes the static brand files from the mascot's geometry in components/site/mascot-geometry.ts:
//   app/icon.svg                         the favicon: the head alone, simplified to read at 16px
//   app/apple-icon.png                   180×180, full bleed (iOS rounds the corners itself)
//   public/brand/mark-{light,dark}.svg   the head alone
//   public/brand/logo-{light,dark}.svg   the head and the word
//   public/brand/icon-{192,512}.png      the web app manifest's icons (app/manifest.ts)
//   public/brand/icon-maskable-512.png   full bleed, for platforms that crop icons to a shape
//
// Run from web/ after changing the mascot, the wordmark or the default themes' text color:
//   node scripts/brand-icons.mjs
// Needs a Node that runs TypeScript directly (22.18 or later), since it imports mascot.ts.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { LOCKUP, MASCOT_COLORS, MASCOT_FORMS, lockupSvgBody, mascotSvgBody } from "../components/site/mascot-geometry.ts";

const root = new URL("../", import.meta.url);
const out = (path) => new URL(path, root);

// The two default themes' colors, read from the generated catalog, so the word matches the site.
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

const svg = ([x, y, width, height], body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${title}">` +
  `<title>${title}</title>${body}</svg>\n`;

const square = ([x, y, side]) => [x, y, side, side];
const HEAD = MASCOT_FORMS.head;

// The app icons: the simplified head on the light plate. `bleed` fills the whole square, for
// icons the platform crops to its own shape, and keeps the head inside the middle 80% circle.
const PLATE = "#fcf7f2";
const tile = ({ bleed = false } = {}) => {
  const [x, y, side] = HEAD.iconBox;
  const pad = side * (bleed ? 0.2 : 0.09);
  const box = [x - pad, y - pad, side + 2 * pad];
  const radius = bleed ? 0 : box[2] * 0.22;
  return {
    box: square(box),
    body:
      `<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[2]}" rx="${radius}" fill="${PLATE}"/>` +
      mascotSvgBody("head", { simple: true }),
  };
};

mkdirSync(out("public/brand/"), { recursive: true });

const files = {
  "app/icon.svg": svg(square(HEAD.iconBox), mascotSvgBody("head", { simple: true }), "codebases"),
  "public/brand/mark-light.svg": svg(square(HEAD.box), mascotSvgBody("head"), "codebases"),
  "public/brand/mark-dark.svg": svg(square(HEAD.box), mascotSvgBody("head", { edge: MASCOT_COLORS.edge }), "codebases"),
  "public/brand/logo-light.svg": svg(LOCKUP.box, lockupSvgBody({ text: SCHEMES.light.text }), "codebases"),
  "public/brand/logo-dark.svg": svg(
    LOCKUP.box,
    lockupSvgBody({ text: SCHEMES.dark.text, edge: MASCOT_COLORS.edge }),
    "codebases",
  ),
};
for (const [path, text] of Object.entries(files)) {
  writeFileSync(out(path), text);
  console.log(`wrote ${path}`);
}

// PNGs are rendered from the same SVG at a high density, then resized, so edges stay crisp.
async function png(path, size, { box, body }) {
  const source = Buffer.from(svg(box, body, "codebases"));
  await sharp(source, { density: Math.ceil((72 * size * 4) / box[2]) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(out(path)));
  console.log(`wrote ${path}`);
}

await png("app/apple-icon.png", 180, tile({ bleed: true }));
await png("public/brand/icon-192.png", 192, tile());
await png("public/brand/icon-512.png", 512, tile());
await png("public/brand/icon-maskable-512.png", 512, tile({ bleed: true }));
