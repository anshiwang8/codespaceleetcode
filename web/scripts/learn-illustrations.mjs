// Draws the four interim section illustrations for the Learn page and renders them:
//   public/learn/src/group-<n>.svg          the vector scene, 960 by 640
//   public/learn/group-<n>-{480,960}.webp   what the page shows (3:2)
//
// The scenes are composed here from the mascot's geometry (components/site/mascot-geometry.ts)
// and a few simple props, in the mascot's fixed colors, so the SVG files are written by this
// script too; change a scene here, not in the SVG. Run from web/:
//   node scripts/learn-illustrations.mjs
// Needs a Node that runs TypeScript directly (22.18 or later), since it imports mascot-geometry.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { MASCOT_COLORS, MASCOT_FORMS, mascotSvgBody } from "../components/site/mascot-geometry.ts";

const root = new URL("../public/learn/", import.meta.url);
const WIDTH = 960;
const HEIGHT = 640;
const PLATE = "#fcf7f2";
const GROUND = "#f3e8de";
const { body: BODY, bodyDeep: DEEP, mint: MINT, teal: TEAL, ink: INK, face: WHITE } = MASCOT_COLORS;

// The props' outline: the full mascot's 12-unit outline at the size the scenes draw it.
const LINE = 7.5;
const outline = (width = LINE) =>
  `stroke="${INK}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;

/** The mascot in a square of `size` whose top left is (x, y). */
const mascot = (form, x, y, size) => {
  const [bx, by, side] = MASCOT_FORMS[form].box;
  const scale = size / side;
  return `<g transform="translate(${x} ${y}) scale(${scale}) translate(${-bx} ${-by})">${mascotSvgBody(form)}</g>`;
};

const ground = (cx, cy, rx) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${Math.round(rx / 10)}" fill="${GROUND}"/>`;
const box = (x, y, w, h, r, fill, width = LINE) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${outline(width)}/>`;
const bar = (x, y, w, fill, h = 14) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>`;
const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
const spark = (x, y, angle) =>
  `<g transform="translate(${x} ${y}) rotate(${angle})"><rect x="-5" y="-22" width="10" height="26" rx="5" fill="${MINT}"/></g>`;

// 1. Read a small program: a printout with one line picked out, and boxes holding values.
function readProgram() {
  const lines = [
    [0, 150, BODY],
    [28, 112, DEEP],
    [28, 150, BODY],
    [28, 96, INK],
    [56, 104, DEEP],
    [28, 128, BODY],
    [0, 64, DEEP],
  ];
  const paper =
    `<g transform="rotate(4 605 310)">` +
    box(480, 104, 250, 412, 16, WHITE) +
    `<rect x="494" y="${150 + 3 * 46 - 13}" width="222" height="40" rx="12" fill="${MINT}"/>` +
    lines.map(([indent, length, fill], index) => bar(510 + indent, 150 + index * 46, length, fill)).join("") +
    `</g>`;
  const value = (x, y, angle, dots) =>
    `<g transform="rotate(${angle} ${x + 44} ${y + 44})">` + box(x, y, 88, 88, 18, WHITE) + dots + `</g>`;
  return (
    ground(245, 512, 175) +
    mascot("full", 62, 150, 366) +
    paper +
    value(790, 96, -7, dot(834, 140, 13, TEAL)) +
    value(812, 262, 6, dot(840, 306, 12, DEEP) + dot(872, 306, 12, MINT)) +
    value(782, 430, -4, dot(808, 488, 11, TEAL) + dot(826, 458, 11, BODY) + dot(844, 488, 11, MINT)) +
    spark(752, 300, 80) +
    spark(752, 328, 100)
  );
}

// 2. Navigate a repository: a folder tree drawn as a map, a dotted route through three files.
function navigateRepository() {
  const folder = (x, y) =>
    `<rect x="${x}" y="${y}" width="58" height="40" rx="11" fill="${DEEP}" ${outline()}/>` + box(x, y + 16, 120, 68, 13, BODY);
  const file = (x, y, marked = false) =>
    box(x, y, 84, 96, 12, WHITE) +
    bar(x + 16, y + 22, 40, BODY, 11) +
    bar(x + 16, y + 43, 52, marked ? MINT : BODY, 11) +
    bar(x + 16, y + 64, 30, DEEP, 11);
  const branch = (x1, y1, x2, y2) => {
    const turn = (x1 + x2) / 2;
    return `<path d="M${x1} ${y1}H${turn}V${y2}H${x2}" fill="none" ${outline(6)}/>`;
  };
  const tree =
    branch(210, 288, 320, 171) +
    branch(210, 288, 320, 406) +
    branch(440, 171, 540, 98) +
    branch(440, 171, 540, 213) +
    branch(440, 406, 540, 333) +
    branch(440, 406, 540, 463) +
    `<path d="M660 463H760" fill="none" ${outline(6)}/>`;
  const route =
    `<path d="M582 98C760 110 760 300 600 333C690 345 790 360 802 448" fill="none" stroke="${TEAL}" stroke-width="9" stroke-linecap="round" stroke-dasharray="0.1 22"/>`;
  const lens =
    `<path d="M852 498L902 548" fill="none" ${outline(26)}/>` +
    `<path d="M852 498L902 548" fill="none" stroke="${BODY}" stroke-width="11" stroke-linecap="round"/>` +
    `<circle cx="802" cy="448" r="70" fill="${WHITE}" fill-opacity="0.3" ${outline(13)}/>` +
    `<path d="M752 432A54 54 0 0 1 776 402" fill="none" stroke="${WHITE}" stroke-width="8" stroke-linecap="round"/>`;
  return (
    ground(178, 590, 120) +
    tree +
    route +
    folder(90, 238) +
    folder(320, 121) +
    folder(320, 356) +
    file(540, 50, true) +
    file(540, 165) +
    file(540, 285, true) +
    folder(540, 413) +
    file(760, 400, true) +
    lens +
    mascot("head", 60, 384, 236)
  );
}

// 3. Follow a web request: an envelope on its way along a pipe, through three gates, to a server.
function followRequest() {
  const gate = (x, passed) =>
    `<path d="M${x} 186V150" fill="none" ${outline()}/>` +
    box(x - 23, 180, 46, 100, 13, DEEP) +
    `<circle cx="${x}" cy="124" r="30" fill="${passed ? MINT : WHITE}" ${outline()}/>` +
    (passed
      ? `<path d="M${x - 13} ${125}L${x - 4} ${135}L${x + 14} ${113}" fill="none" ${outline(7)}/>`
      : dot(x, 124, 7, BODY));
  const envelope =
    `<g transform="rotate(-7 318 178)">` +
    box(268, 144, 100, 68, 12, WHITE) +
    `<path d="M272 150L318 184L364 150" fill="none" ${outline(6)}/>` +
    `</g>` +
    `<path d="M214 150H246M200 178H240M218 206H246" fill="none" stroke="${TEAL}" stroke-width="8" stroke-linecap="round"/>`;
  const server =
    box(724, 118, 170, 224, 20, DEEP) +
    [0, 1, 2].map((row) => box(744, 138 + row * 64, 130, 48, 12, BODY, 5.5) + dot(770, 162 + row * 64, 8, MINT) + bar(792, 156 + row * 64, 62, DEEP, 12)).join("");
  return (
    ground(482, 596, 170) +
    box(66, 208, 700, 44, 22, BODY) +
    `<path d="M92 221H700" fill="none" stroke="${WHITE}" stroke-opacity="0.35" stroke-width="6" stroke-linecap="round"/>` +
    server +
    gate(170, true) +
    gate(430, false) +
    gate(610, false) +
    envelope +
    mascot("full", 330, 296, 310)
  );
}

// 4. Reason about systems: two gears turning together, a storage drum, a stream of dots between.
function reasonAboutSystems() {
  const gear = (cx, cy, teeth, rootRadius, tipRadius, turn, fill, hub) => {
    const step = (2 * Math.PI) / teeth;
    const at = (radius, angle) => `${(cx + radius * Math.cos(angle)).toFixed(1)} ${(cy + radius * Math.sin(angle)).toFixed(1)}`;
    let d = "";
    for (let tooth = 0; tooth < teeth; tooth += 1) {
      const middle = turn + tooth * step;
      d +=
        `${tooth === 0 ? "M" : "L"}${at(rootRadius, middle - step * 0.3)}` +
        `L${at(tipRadius, middle - step * 0.17)}L${at(tipRadius, middle + step * 0.17)}L${at(rootRadius, middle + step * 0.3)}`;
    }
    return (
      `<path d="${d}Z" fill="${fill}" ${outline()}/>` +
      `<circle cx="${cx}" cy="${cy}" r="${hub}" fill="${WHITE}" ${outline()}/>`
    );
  };
  const drum =
    `<path d="M688 430V548A82 26 0 0 0 852 548V430Z" fill="${DEEP}" ${outline()}/>` +
    `<path d="M688 472A82 26 0 0 0 852 472M688 512A82 26 0 0 0 852 512" fill="none" ${outline(5.5)}/>` +
    `<ellipse cx="770" cy="430" rx="82" ry="26" fill="${BODY}" ${outline()}/>`;
  // Dots along a curve from the large gear over into the drum, shrinking as they go.
  const stream = [0.04, 0.2, 0.36, 0.52, 0.68, 0.84, 1]
    .map((t) => {
      const x = (1 - t) ** 2 * 600 + 2 * (1 - t) * t * 772 + t ** 2 * 770;
      const y = (1 - t) ** 2 * 356 + 2 * (1 - t) * t * 318 + t ** 2 * 420;
      return dot(x.toFixed(1), y.toFixed(1), (12 - 4 * t).toFixed(1), t > 0.9 ? MINT : TEAL);
    })
    .join("");
  return (
    ground(232, 520, 172) +
    ground(770, 580, 110) +
    mascot("full", 50, 162, 364) +
    gear(566, 236, 10, 84, 108, -0.096, BODY, 30) +
    gear(713, 172, 7, 52, 76, 2.731, MINT, 20) +
    drum +
    stream
  );
}

const SCENES = [readProgram, navigateRepository, followRequest, reasonAboutSystems];

mkdirSync(new URL("src/", root), { recursive: true });

for (const [index, scene] of SCENES.entries()) {
  const name = `group-${index + 1}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${PLATE}"/>${scene()}</svg>\n`;
  writeFileSync(new URL(`src/${name}.svg`, root), svg);
  console.log(`wrote public/learn/src/${name}.svg`);
  // Rendered at twice the larger size, then resized, so edges stay crisp.
  for (const width of [480, 960]) {
    await sharp(Buffer.from(svg), { density: 144 })
      .resize(width, (width * HEIGHT) / WIDTH)
      .webp({ quality: 90 })
      .toFile(fileURLToPath(new URL(`${name}-${width}.webp`, root)));
    console.log(`wrote public/learn/${name}-${width}.webp`);
  }
}
