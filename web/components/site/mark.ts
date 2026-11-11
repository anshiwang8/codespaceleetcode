/*
 * The codebases mark, on a 32-unit grid: a curly brace drawn as a branching path. Its point is a
 * root node and its two arms end in nodes, so it reads both as code and as a small tree of
 * connected parts. It sits on a rounded tile in the accent color.
 *
 * This is the one copy of the geometry. Logo.tsx draws it with theme tokens, app/opengraph-image.tsx
 * with the default theme's colors, and scripts/brand-icons.mjs writes app/icon.svg, the app icons
 * and public/brand/ from it (run `node scripts/brand-icons.mjs` from web/ after changing it).
 * Plain TypeScript with no imports, so Node can run it directly.
 */

export const MARK_SIZE = 32;
export const MARK_RADIUS = 7;
export const MARK_STROKE = 2.5;
/** The stem from the root node to the brace's point, then the brace from the top arm to the bottom. */
export const MARK_PATH = "M8.5 16h6M22 7h-2.5A2.5 2.5 0 0 0 17 9.5V14l-2.5 2 2.5 2v4.5a2.5 2.5 0 0 0 2.5 2.5H22";
export const MARK_NODE_RADIUS = 2.5;
export const MARK_NODES: readonly { cx: number; cy: number }[] = [
  { cx: 8.5, cy: 16 },
  { cx: 23.5, cy: 7 },
  { cx: 23.5, cy: 25 },
];

/**
 * The mark as SVG elements, for a static file. `tile` and `ink` are colors. `bleed` fills the whole
 * square, for icons the platform crops to its own shape, and shrinks the glyph into the middle 80%
 * circle that such an icon always keeps.
 */
export function markSvgBody({ tile, ink, bleed = false }: { tile: string; ink: string; bleed?: boolean }): string {
  const background = bleed
    ? `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" fill="${tile}"/>`
    : `<rect width="${MARK_SIZE}" height="${MARK_SIZE}" rx="${MARK_RADIUS}" fill="${tile}"/>`;
  const glyph = bleed ? `<g transform="translate(16 16) scale(0.86) translate(-16 -16)">` : "<g>";
  const nodes = MARK_NODES.map(({ cx, cy }) => `<circle cx="${cx}" cy="${cy}" r="${MARK_NODE_RADIUS}"/>`).join("");
  return (
    background +
    glyph +
    `<path d="${MARK_PATH}" fill="none" stroke="${ink}" stroke-width="${MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<g fill="${ink}">${nodes}</g>` +
    "</g>"
  );
}
