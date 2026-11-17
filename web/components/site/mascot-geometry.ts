/*
 * The codebases mascot and wordmark, redrawn by hand as vector shapes from the owner's raster
 * reference (Codebases Mascot Brand Identity.png at the repo root). Two forms:
 *
 *   head  the cap with its </> badge, the face, both arms on the cap and two spark lines. The logo.
 *   full  the seated figure holding the magnifier.
 *
 * Coordinates are the reference's own pixels, so a shape can be checked against the picture
 * directly; each form's `box` is the square viewBox around it. Shapes are listed back to front.
 *
 * This is the one copy of the geometry. Mascot.tsx and Logo.tsx draw it with the --mascot-* custom
 * properties of app/globals.css, app/opengraph-image.tsx with the hex values below, and
 * scripts/brand-icons.mjs writes app/icon.svg, the app icons and public/brand/ from it (run
 * `node scripts/brand-icons.mjs` from web/ after changing it). Plain TypeScript with no imports, so
 * Node can run it directly.
 */

/** The mascot's fixed colors. Each matches a --mascot-* custom property in app/globals.css. */
export const MASCOT_COLORS = {
  body: "#959ffd",
  bodyDeep: "#5c5fcf",
  mint: "#88f8d0",
  teal: "#1f9bb0",
  ink: "#121650",
  face: "#ffffff",
  blush: "#ffdfdc",
  tongue: "#ff9f9e",
  /** The light edge behind the outline on dark backgrounds, drawn at MASCOT_EDGE_OPACITY. */
  edge: "#f1f2fb",
} as const;

export const MASCOT_EDGE_OPACITY = 0.85;

export type MascotPaint = keyof typeof MASCOT_COLORS;

/** The same paints as custom properties, for components. The edge is transparent in light schemes. */
export const MASCOT_PAINT_VARIABLES: Record<MascotPaint, string> = {
  body: "var(--mascot-body)",
  bodyDeep: "var(--mascot-body-deep)",
  mint: "var(--mascot-mint)",
  teal: "var(--mascot-teal)",
  ink: "var(--mascot-ink)",
  face: "var(--mascot-face)",
  blush: "var(--mascot-blush)",
  tongue: "var(--mascot-tongue, var(--mascot-blush))",
  edge: "var(--mascot-edge)",
};

export type MascotShape = {
  d: string;
  fill?: MascotPaint;
  stroke?: MascotPaint;
  /** Stroke width, in the form's units. */
  width?: number;
  opacity?: number;
  /** Square stroke ends; the default is round. */
  butt?: true;
  /** Left out of the simplified drawing used for the favicon and app icons. */
  detail?: true;
  /** Part of the silhouette, so it also gets the light edge on dark backgrounds. */
  outline?: true;
};

export type MascotForm = "head" | "full";

export type MascotGeometry = {
  /** The square viewBox: x, y and side. */
  box: readonly [number, number, number];
  /** A tighter square around the simplified drawing, for icons. */
  iconBox: readonly [number, number, number];
  /** How far the light edge reaches past the outline. */
  edge: number;
  shapes: readonly MascotShape[];
};

const num = (value: number): string => String(Math.round(value * 100) / 100);

function ellipse(cx: number, cy: number, rx: number, ry: number, clockwise = true): string {
  const sweep = clockwise ? 1 : 0;
  return (
    `M${num(cx - rx)} ${num(cy)}` +
    `A${num(rx)} ${num(ry)} 0 0 ${sweep} ${num(cx + rx)} ${num(cy)}` +
    `A${num(rx)} ${num(ry)} 0 0 ${sweep} ${num(cx - rx)} ${num(cy)}Z`
  );
}

const circle = (cx: number, cy: number, r: number): string => ellipse(cx, cy, r, r);

/** A bent arm: a wide ink line under a narrower body-colored one, with highlights along it. */
function arm(d: string, ink: number, fill: number, butt = false): MascotShape[] {
  const ends = butt ? ({ butt: true } as const) : {};
  return [
    { d, stroke: "ink", width: ink, outline: true, ...ends },
    { d, stroke: "body", width: fill, ...ends },
  ];
}

/** The </> glyph as three round-ended lines. */
function glyph(left: string, slash: string, right: string, width: number): MascotShape[] {
  return [left, slash, right].map((d) => ({ d, stroke: "mint" as const, width }));
}

const HEAD_FACE = "M162 480C162 455 178 441 200 435.5C230 429 262 428 277 431.5C289 435 293 453 293 472C293 505 262 524 227 524C190 524 162 508 162 480Z";

const HEAD: MascotGeometry = {
  box: [88, 316, 272],
  iconBox: [92, 321, 264],
  edge: 5,
  shapes: [
    // The pack behind the left arm.
    { d: "M125 494C108 498 100 512 101 528C102 546 115 553.5 135 553.5L152 553.5C166 553.5 177 545 176 530L150 498Z", fill: "ink", outline: true },
    { d: "M116 507C110 515 111 530 121 538.5L134 539C138 535 140 530 139 526L120 506Z", fill: "mint" },
    { d: "M142 542.5L147 532L167 533C166.5 538 163 541.5 159 542.5Z", fill: "mint" },
    // The head, the right arm that goes behind the face, then the face.
    { d: ellipse(230, 478, 78, 61), fill: "ink", outline: true },
    { d: "M132 473L170 438L170 508ZM317 468L288 438L288 502Z", fill: "ink" },
    ...arm("M286 422L333 468L297 510", 41, 22),
    { d: "M309 446L326 462", stroke: "face", width: 2.5, opacity: 0.35, detail: true },
    { d: HEAD_FACE, stroke: "ink", width: 16 },
    { d: HEAD_FACE, fill: "face" },
    { d: ellipse(195, 495, 14, 12.5), fill: "blush", detail: true },
    { d: ellipse(280, 488, 11, 12), fill: "blush", detail: true },
    { d: ellipse(205, 471, 8.3, 14), fill: "ink" },
    { d: ellipse(269, 466, 8, 13.5), fill: "ink" },
    { d: "M229 479L253 476C254 490 250 500 241 500C233 500 229 490 229 479Z", fill: "ink", stroke: "ink", width: 5 },
    { d: "M232 484C238 482 247 484 250 489C249 494 245 497 241 497C236 497 232 491 232 484Z", fill: "tongue" },
    // The shadow under the cap, which also hides the right arm's upper end.
    { d: "M160 432L175 425L250 405L302 402L304 418L300 425L288 432L270 426L230 424L200 430L176 439L160 441Z", fill: "ink" },
    // The cap: dome, badge, brim.
    { d: "M143 424C143 392 172 358 216 358C243 358 262 373 268 393L272 402L180 430Z", fill: "bodyDeep" },
    { d: "M148 420C148 398 164 376 187 366C174 380 166 398 170 418Z", fill: "body", detail: true },
    { d: "M143 424C143 392 172 358 216 358C243 358 262 373 268 393", stroke: "ink", width: 10, outline: true },
    ...glyph("M198 378L187.5 388L199 396", "M216 370.5L209 397", "M224 375L236 383L225.5 391", 4.6),
    { d: "M174 424C200 412 245 399 288 398C299 398 304 406 302 413C301 417 299 418 296 418C265 418 222 425 182 440Z", fill: "body", stroke: "ink", width: 10, outline: true },
    { d: "M192 426C220 414.5 258 407 290 406.5", stroke: "face", width: 2.5, opacity: 0.35, detail: true },
    // The left arm, in front of everything.
    ...arm("M157 435L115.5 473L161 513", 41, 22),
    { d: "M114 464L147 433", stroke: "face", width: 2.5, opacity: 0.35, detail: true },
    { d: "M137.5 481.5L162 503.5", stroke: "face", width: 2.5, opacity: 0.35, detail: true },
    // Two spark lines.
    { d: "M306.5 352L316.5 355L304 380L298 377.5Z", fill: "mint", stroke: "mint", width: 3, detail: true },
    { d: "M337.5 368L344 376L318 391.5L314.5 386Z", fill: "mint", stroke: "mint", width: 3, detail: true },
  ],
};

const FULL_FACE = "M1277 455C1277 420 1290 400 1320 388C1370 368 1440 360 1500 363C1535 366 1552 395 1552 440C1552 500 1500 552 1410 552C1325 552 1277 510 1277 455Z";

const FULL: MascotGeometry = {
  box: [1146, 190, 528],
  iconBox: [1152, 196, 516],
  edge: 9,
  shapes: [
    // The body and the pack, as one ink shape with colored panels on it.
    { d: "M1235 545C1205 548 1190 570 1194 592C1196 602 1202 610 1210 613C1200 628 1200 650 1210 668C1222 688 1260 690 1300 695C1340 699 1400 700 1440 693L1526 692C1539 692 1545 684 1542 673L1528 625L1500 560Z", fill: "ink", outline: true },
    { d: "M1240 548C1222 552 1208 566 1208 582C1208 590 1212 596 1217 600C1220 580 1232 562 1250 553Z", fill: "mint" },
    { d: "M1241 568C1250 563 1275 562 1283 568C1288 573 1288 580 1286 588L1262 672C1245 670 1228 662 1222 648C1218 638 1222 622 1226 608Z", fill: "mint" },
    { d: "M1303 587C1310 575 1340 574 1355 587C1362 594 1366 600 1366 606C1345 612 1330 630 1327 652L1326 677L1276 677C1280 650 1290 615 1303 587Z", fill: "body" },
    { d: "M1357 571C1370 576 1380 588 1383 601", stroke: "mint", width: 9, butt: true },
    { d: "M1294 566L1304 557L1298 568Z", fill: "mint", detail: true },
    { d: "M1310 567L1317 561L1325 564Z", fill: "mint", detail: true },
    { d: "M1385 572L1410 571L1421 580L1430 580L1441 570L1452 566L1455 580L1462 598L1397 598Z", fill: "body" },
    { d: "M1447 568L1452 566L1455 580L1462 598L1452 598Z", fill: "bodyDeep", opacity: 0.6, detail: true },
    { d: "M1490 628L1512 634L1518 650L1526 683L1430 686L1430 640Z", fill: "body" },
    { d: "M1500 631L1512 634L1526 683L1506 684Z", fill: "bodyDeep", opacity: 0.55, detail: true },
    { d: "M1335 683C1333 655 1342 628 1366 614C1380 607 1400 607 1418 609C1410 630 1412 655 1421 681Z", fill: "body", stroke: "ink", width: 12 },
    { d: "M1396 615L1411 614C1404 632 1406 655 1414 675L1401 676C1391 655 1391 632 1396 615Z", fill: "bodyDeep", opacity: 0.45, detail: true },
    // The head, the right arm that goes behind the face, then the face.
    { d: ellipse(1417, 458, 168, 108), fill: "ink", outline: true },
    { d: "M1226 452L1295 390L1295 518ZM1598 430L1545 380L1545 485Z", fill: "ink" },
    ...arm("M1548 368L1628 430L1566 492", 74, 50),
    { d: "M1590 384L1632 416", stroke: "face", width: 6, opacity: 0.3, detail: true },
    { d: FULL_FACE, stroke: "ink", width: 24 },
    { d: FULL_FACE, fill: "face" },
    { d: ellipse(1335, 490, 28, 25), fill: "blush", detail: true },
    { d: ellipse(1522, 462, 26, 22), fill: "blush", detail: true },
    { d: ellipse(1355, 445, 18, 29), fill: "ink" },
    { d: ellipse(1498, 429, 17, 27.5), fill: "ink" },
    { d: "M1408 457L1459 449C1461 478 1451 499 1432 499C1416 499 1407 480 1408 457Z", fill: "ink", stroke: "ink", width: 9 },
    { d: "M1412 463C1425 458 1445 462 1453 474C1450 487 1442 494 1432 494C1420 494 1413 480 1412 463Z", fill: "tongue" },
    // The shadow under the cap, which also hides the right arm's upper end.
    { d: "M1262 385L1290 378L1312 368L1400 338L1500 323L1572 326L1578 345L1570 353L1540 371L1530 364L1500 357L1450 356L1350 371L1300 390L1280 402Z", fill: "ink" },
    // The cap: dome, badge, brim.
    { d: "M1236 362C1233 282 1297 216 1397 216C1450 217 1492 245 1508 291L1510 296C1440 300 1370 322 1290 362Z", fill: "bodyDeep" },
    { d: "M1245 356C1246 304 1270 268 1298 249C1284 275 1276 305 1280 345Z", fill: "body", detail: true },
    { d: "M1236 362C1233 282 1297 216 1397 216C1450 217 1492 245 1508 291", stroke: "ink", width: 12, outline: true },
    ...glyph("M1363 258L1338 277L1367 294", "M1399 243L1385 297", "M1418 253L1442 268L1420 287", 8.5),
    { d: "M1300 354C1360 326 1440 304 1530 300C1565 299 1578 312 1576 328C1575 337 1570 340 1560 339C1500 334 1400 345 1312 384Z", fill: "body", stroke: "ink", width: 12, outline: true },
    { d: "M1335 353C1400 330 1480 316 1552 316", stroke: "face", width: 6, opacity: 0.3, detail: true },
    // The left arm.
    ...arm("M1270 381L1192 452L1278 527", 74, 50),
    { d: "M1189 431L1254 371", stroke: "face", width: 6, opacity: 0.35, detail: true },
    { d: "M1241.5 471L1287 511", stroke: "face", width: 6, opacity: 0.35, detail: true },
    // The magnifier: handle, hand, ring, lens and its glyph.
    { d: "M1490 604L1455 638", stroke: "ink", width: 26, butt: true, outline: true },
    { d: "M1490 604L1455 638", stroke: "face", width: 12, butt: true },
    { d: "M1490 604L1455 638", stroke: "ink", width: 12, butt: true, opacity: 0.14 },
    { d: circle(1451, 641, 36), fill: "face", stroke: "ink", width: 12, outline: true },
    { d: circle(1540, 555, 77.5), fill: "face", stroke: "ink", width: 11, outline: true },
    { d: circle(1538, 555, 54), fill: "bodyDeep" },
    { d: circle(1538, 555, 54), fill: "ink", opacity: 0.72 },
    { d: circle(1538, 555, 46), fill: "teal" },
    ...glyph("M1516 540L1496 554.5L1516 570", "M1544 531L1529 582", "M1556 540L1576 555L1557 570", 9.5),
    // Two spark lines.
    { d: "M1586 240L1601 246L1581 277L1573 274Z", fill: "mint", stroke: "mint", width: 5, detail: true },
    { d: "M1628 265L1637 275L1601 295L1596 288Z", fill: "mint", stroke: "mint", width: 5, detail: true },
  ],
};

export const MASCOT_FORMS: Record<MascotForm, MascotGeometry> = { head: HEAD, full: FULL };

/** The shapes to draw: all of them, or without the details. */
export function mascotShapes(form: MascotForm, simple = false): readonly MascotShape[] {
  const { shapes } = MASCOT_FORMS[form];
  return simple ? shapes.filter((shape) => !shape.detail) : shapes;
}

/** The silhouette shapes, widened by the form's edge, to draw behind the figure in the edge color. */
export function mascotEdgeShapes(form: MascotForm, simple = false): { d: string; width: number; filled: boolean; butt: boolean }[] {
  const { edge } = MASCOT_FORMS[form];
  return mascotShapes(form, simple)
    .filter((shape) => shape.outline)
    .map((shape) => ({
      d: shape.d,
      width: (shape.stroke ? (shape.width ?? 0) : 0) + 2 * edge,
      filled: Boolean(shape.fill),
      butt: Boolean(shape.butt),
    }));
}

type Palette = Record<MascotPaint, string>;

function shapeSvg(shape: MascotShape, colors: Palette): string {
  const fill = shape.fill ? colors[shape.fill] : "none";
  const stroke = shape.stroke
    ? ` stroke="${colors[shape.stroke]}" stroke-width="${shape.width ?? 1}" stroke-linecap="${shape.butt ? "butt" : "round"}" stroke-linejoin="round"`
    : "";
  const opacity = shape.opacity === undefined ? "" : ` opacity="${shape.opacity}"`;
  return `<path d="${shape.d}" fill="${fill}"${stroke}${opacity}/>`;
}

/**
 * A form as SVG elements in its own coordinates, for a static file. `simple` drops the details;
 * `edge` is the light edge's color, for dark backgrounds.
 */
export function mascotSvgBody(
  form: MascotForm,
  { simple = false, edge, colors = MASCOT_COLORS }: { simple?: boolean; edge?: string; colors?: Palette } = {},
): string {
  const behind = edge
    ? `<g opacity="${MASCOT_EDGE_OPACITY}" stroke="${edge}" stroke-linejoin="round">` +
      mascotEdgeShapes(form, simple)
        .map(
          ({ d, width, filled, butt }) =>
            `<path d="${d}" fill="${filled ? edge : "none"}" stroke-width="${width}" stroke-linecap="${butt ? "butt" : "round"}"/>`,
        )
        .join("") +
      "</g>"
    : "";
  return behind + mascotShapes(form, simple).map((shape) => shapeSvg(shape, colors)).join("");
}

/*
 * The wordmark: "codebases" in rounded bold lowercase, built from rings, round-ended arcs and
 * stems so every stroke keeps one weight. One path, filled with the text color. Units are the
 * reference's pixels, the same scale as the head form, with the origin at the word's top left.
 */

type Radii = { rx: number; ry: number };

const point = (cx: number, cy: number, { rx, ry }: Radii, degrees: number): [number, number] => {
  const angle = (degrees * Math.PI) / 180;
  return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
};

/** Arc commands along an ellipse from one angle to another (degrees, clockwise on screen), in quarter turns at most. */
function arcTo(cx: number, cy: number, radii: Radii, from: number, to: number): string {
  const sweep = to > from ? 1 : 0;
  const steps = Math.ceil(Math.abs(to - from) / 90);
  let out = "";
  for (let step = 1; step <= steps; step += 1) {
    const [x, y] = point(cx, cy, radii, from + ((to - from) * step) / steps);
    out += `A${num(radii.rx)} ${num(radii.ry)} 0 0 ${sweep} ${num(x)} ${num(y)}`;
  }
  return out;
}

/** A round end from one side of a stroke to the other, bulging toward `forward` (a unit vector). */
function roundEnd(from: [number, number], to: [number, number], forward: [number, number]): string {
  const r = Math.hypot(to[0] - from[0], to[1] - from[1]) / 2;
  const tip: [number, number] = [(from[0] + to[0]) / 2 + forward[0] * r, (from[1] + to[1]) / 2 + forward[1] * r];
  const cross = (tip[0] - from[0]) * (to[1] - tip[1]) - (tip[1] - from[1]) * (to[0] - tip[0]);
  const sweep = cross > 0 ? 1 : 0;
  return `A${num(r)} ${num(r)} 0 0 ${sweep} ${num(tip[0])} ${num(tip[1])}A${num(r)} ${num(r)} 0 0 ${sweep} ${num(to[0])} ${num(to[1])}`;
}

/** The unit tangent of an ellipse at an angle, in the direction of increasing angle. */
function tangent({ rx, ry }: Radii, degrees: number): [number, number] {
  const angle = (degrees * Math.PI) / 180;
  const x = -rx * Math.sin(angle);
  const y = ry * Math.cos(angle);
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}

const mid = (outer: Radii, inner: Radii): Radii => ({ rx: (outer.rx + inner.rx) / 2, ry: (outer.ry + inner.ry) / 2 });

/** Part of a ring from one angle to a larger one, each end round or flat. */
function band(cx: number, cy: number, outer: Radii, inner: Radii, from: number, to: number, roundFrom: boolean, roundTo: boolean): string {
  const start = point(cx, cy, outer, from);
  const innerEnd = point(cx, cy, inner, to);
  const innerStart = point(cx, cy, inner, from);
  const forward = tangent(mid(outer, inner), to);
  const back = tangent(mid(outer, inner), from);
  return (
    `M${num(start[0])} ${num(start[1])}` +
    arcTo(cx, cy, outer, from, to) +
    (roundTo ? roundEnd(point(cx, cy, outer, to), innerEnd, forward) : `L${num(innerEnd[0])} ${num(innerEnd[1])}`) +
    arcTo(cx, cy, inner, to, from) +
    (roundFrom ? roundEnd(innerStart, start, [-back[0], -back[1]]) : "") +
    "Z"
  );
}

const ring = (cx: number, cy: number, outer: Radii, inner: Radii): string =>
  ellipse(cx, cy, outer.rx, outer.ry) + ellipse(cx, cy, inner.rx, inner.ry, false);

/** An upright stem with fully round ends. */
function stem(x: number, top: number, bottom: number, width: number): string {
  const r = width / 2;
  return (
    `M${num(x)} ${num(top + r)}A${num(r)} ${num(r)} 0 0 1 ${num(x + width)} ${num(top + r)}` +
    `L${num(x + width)} ${num(bottom - r)}A${num(r)} ${num(r)} 0 0 1 ${num(x)} ${num(bottom - r)}Z`
  );
}

const rect = (x: number, y: number, width: number, height: number): string =>
  `M${num(x)} ${num(y)}L${num(x + width)} ${num(y)}L${num(x + width)} ${num(y + height)}L${num(x)} ${num(y + height)}Z`;

const WORD_ASCENDER = 1;
const WORD_X_TOP = 33;
const WORD_BASELINE = 104;
const WORD_MIDDLE = (WORD_X_TOP + WORD_BASELINE) / 2;
const WORD_WEIGHT = 19.5;
const BOWL: Radii = { rx: 37, ry: (WORD_BASELINE - WORD_X_TOP) / 2 };
const COUNTER: Radii = { rx: BOWL.rx - WORD_WEIGHT, ry: BOWL.ry - WORD_WEIGHT };

function letterC(cx: number): string {
  const outer = { rx: 36, ry: BOWL.ry };
  return band(cx, WORD_MIDDLE, outer, { rx: 16.5, ry: COUNTER.ry }, 45, 315, true, true);
}

function letterE(cx: number): string {
  const outer = { rx: 35, ry: BOWL.ry };
  const inner = { rx: 15.5, ry: 18 };
  return band(cx, WORD_MIDDLE, outer, inner, 56, 372, true, false) + rect(cx - 20, WORD_MIDDLE - 6.5, 50, 11.5);
}

function letterS(cx: number): string {
  const ry = (WORD_BASELINE - WORD_X_TOP - WORD_WEIGHT) / 4;
  const outer = { rx: 30.5, ry: ry + WORD_WEIGHT / 2 };
  const inner = { rx: 30.5 - WORD_WEIGHT, ry: ry - WORD_WEIGHT / 2 };
  const middle = mid(outer, inner);
  const upper = WORD_X_TOP + WORD_WEIGHT / 2 + ry;
  const lower = WORD_BASELINE - WORD_WEIGHT / 2 - ry;
  const topEnd = -32;
  const bottomEnd = 148;
  const start = point(cx, upper, outer, topEnd);
  const lowerForward = tangent(middle, bottomEnd);
  const upperForward = tangent(middle, topEnd);
  return (
    `M${num(start[0])} ${num(start[1])}` +
    arcTo(cx, upper, outer, topEnd, -270) +
    arcTo(cx, lower, inner, -90, bottomEnd) +
    roundEnd(point(cx, lower, inner, bottomEnd), point(cx, lower, outer, bottomEnd), lowerForward) +
    arcTo(cx, lower, outer, bottomEnd, -90) +
    arcTo(cx, upper, inner, -270, topEnd) +
    roundEnd(point(cx, upper, inner, topEnd), start, upperForward) +
    "Z"
  );
}

function letterA(left: number): string {
  const right = left + 63;
  const hookOuter = { rx: 33, ry: 30.5 };
  const hookInner = { rx: hookOuter.rx - WORD_WEIGHT, ry: hookOuter.ry - WORD_WEIGHT };
  const hookY = WORD_X_TOP + hookOuter.ry;
  return (
    band(right - hookOuter.rx, hookY, hookOuter, hookInner, 232, 360, true, false) +
    stem(right - WORD_WEIGHT, hookY - WORD_WEIGHT / 2, WORD_BASELINE, WORD_WEIGHT) +
    ring(left + 31.5, WORD_BASELINE - 20, { rx: 31.5, ry: 20 }, { rx: 12, ry: 7.5 })
  );
}

const WORD_LETTERS = [
  letterC(37),
  ring(102, WORD_MIDDLE, BOWL, COUNTER),
  ring(180, WORD_MIDDLE, BOWL, COUNTER) + stem(196.5, WORD_ASCENDER, WORD_BASELINE, WORD_WEIGHT),
  letterE(258),
  stem(297, WORD_ASCENDER, WORD_BASELINE, WORD_WEIGHT) + ring(333, WORD_MIDDLE, BOWL, COUNTER),
  letterA(373),
  letterS(471.5),
  letterE(538.5),
  letterS(608),
];

/** The word "codebases": its box, where its x-height band sits in that box, and its one path. */
export const WORDMARK = {
  width: 639,
  height: 105,
  xTop: WORD_X_TOP,
  baseline: WORD_BASELINE,
  d: WORD_LETTERS.join(""),
} as const;

/**
 * The lockup, in the head form's coordinates: the viewBox around head and word, and where the
 * word's box starts. The head sits against the word's x-height band as it does in the reference.
 */
export const LOCKUP = {
  box: [86, 342, 928, 218],
  wordAt: [367, 390],
} as const;

/** The lockup as SVG elements for a static file: the head, then the word in `text`. */
export function lockupSvgBody({ text, edge }: { text: string; edge?: string }): string {
  return (
    mascotSvgBody("head", { edge }) +
    `<path transform="translate(${LOCKUP.wordAt[0]} ${LOCKUP.wordAt[1]})" d="${WORDMARK.d}" fill="${text}"/>`
  );
}
