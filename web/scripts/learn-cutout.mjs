// Cuts the flat background out of the Learn section illustrations, so the plate behind them can
// take the theme's color.
//
//   node scripts/learn-cutout.mjs <dir with group-1..4.png> [--sheet <file.png>]
//
// Reads opaque 3:2 originals (PNG, as generated) and writes, with an alpha channel:
//   public/learn/group-<n>-{480,960}.webp                         what the page shows
//   ../docs/superpowers/specs/assets/learn-illustrations/group-<n>.webp   the full-size cut-out
//
// How: the background is one near-flat color (sampled from the border). What is cut is the
// background-colored area connected to the image's edge. A patch of the same color enclosed by an
// outline stays, because some drawings fill the face with exactly the background color, and a gap
// between an arm and a cap can't be told from it; such a gap reads as a light fill. The pixels
// along the cut are a blend of the shape and the background: each takes the color of its
// strongest neighbor in the shape and an alpha in proportion, which leaves no pale fringe on a
// dark plate.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const inDir = args[0];
const sheetAt = args.indexOf("--sheet");
const sheet = sheetAt >= 0 ? args[sheetAt + 1] : null;
if (!inDir) {
  console.error("usage: node scripts/learn-cutout.mjs <dir with group-1..4.png> [--sheet <file.png>]");
  process.exit(1);
}

/** A pixel this close to the background color (RGB distance) is background. */
const NEAR = 9;
/** How far from a cut the blended edge pixels are looked for. */
const EDGE = 2;

async function cutOut(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const at = (x, y) => (y * W + x) * 3;

  // The background: the median of the border.
  const border = [[], [], []];
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) for (let c = 0; c < 3; c++) border[c].push(data[at(x, y) + c]);
  for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) for (let c = 0; c < 3; c++) border[c].push(data[at(x, y) + c]);
  const bg = border.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);

  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = Math.hypot(data[i * 3] - bg[0], data[i * 3 + 1] - bg[1], data[i * 3 + 2] - bg[2]);

  // Background-colored patches, by connected component; only those touching the edge are cut.
  const isBg = new Uint8Array(W * H);
  const seen = new Uint8Array(W * H);
  const stack = [];
  let gaps = 0;
  for (let start = 0; start < W * H; start++) {
    if (seen[start] || dist[start] >= NEAR) continue;
    const patch = [];
    let touchesEdge = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop();
      patch.push(i);
      const x = i % W;
      const y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) touchesEdge = true;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && !seen[j] && dist[j] < NEAR) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (touchesEdge) for (const i of patch) isBg[i] = 1;
    else if (patch.length > 400) gaps++;
  }

  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isBg[i]) continue; // transparent
      let nearCut = false;
      let strongest = i;
      for (let dy = -EDGE; dy <= EDGE; dy++) {
        for (let dx = -EDGE; dx <= EDGE; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (isBg[j]) nearCut = true;
          else if (dist[j] > dist[strongest]) strongest = j;
        }
      }
      const alpha = nearCut ? Math.min(1, dist[i] / Math.max(dist[strongest], 1)) : 1;
      const source = nearCut ? strongest : i;
      out[i * 4] = data[source * 3];
      out[i * 4 + 1] = data[source * 3 + 1];
      out[i * 4 + 2] = data[source * 3 + 2];
      out[i * 4 + 3] = Math.round(alpha * 255);
    }
  }
  return { image: sharp(out, { raw: { width: W, height: H, channels: 4 } }), bg, gaps, width: W, height: H };
}

const previews = [];
for (const n of [1, 2, 3, 4]) {
  const { image, bg, gaps, width, height } = await cutOut(path.join(inDir, `group-${n}.png`));
  const full = await image.png().toBuffer();
  const archive = path.join(WEB, "../docs/superpowers/specs/assets/learn-illustrations", `group-${n}.webp`);
  const archived = await sharp(full).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toFile(archive);
  for (const w of [480, 960]) {
    const info = await sharp(full)
      .resize(w, (w * 2) / 3, { fit: "cover" })
      .webp({ quality: 88, alphaQuality: 100, effort: 6 })
      .toFile(path.join(WEB, "public/learn", `group-${n}-${w}.webp`));
    console.log(`group-${n}-${w}.webp ${info.size} bytes`);
  }
  console.log(`group-${n}: ${width}x${height}, background rgb(${bg.join(" ")}), ${gaps} enclosed background-colored areas kept, archive ${archived.size} bytes`);
  previews.push(await sharp(full).resize(600, 400).png().toBuffer());
}

if (sheet) {
  // The four cut-outs on a light and a dark plate, to check the edges by eye.
  const plates = ["#f4f5ff", "#1e2250"];
  const tiles = [];
  for (const [row, color] of plates.entries()) {
    for (const [column, input] of previews.entries()) {
      const tile = await sharp({ create: { width: 600, height: 400, channels: 4, background: color } }).composite([{ input }]).png().toBuffer();
      tiles.push({ input: tile, left: column * 610, top: row * 410 });
    }
  }
  await sharp({ create: { width: 2430, height: 810, channels: 3, background: "#808080" } }).composite(tiles).png().toFile(sheet);
  console.log(`wrote ${sheet}`);
}
