# codebases brand files

The name is always **codebases**: one word, all lowercase, even at the start of a sentence.

## The mark

A curly brace drawn as a branching path. Its point is a root node and its two arms end in nodes, so it
reads both as code and as a small tree of connected parts: what you do on the site, finding your way
through a real codebase. It sits on a rounded square in the accent color, on a 32-unit grid (corner
radius 7, stroke 2.5, nodes of radius 2.5).

The one copy of the geometry is `web/components/site/mark.ts`. Everything here, `web/app/icon.svg` and
`web/app/apple-icon.png` are written from it by `web/scripts/brand-icons.mjs`; never edit them by hand.
After changing the mark or the default themes' colors, run from `web/`:

```
node scripts/brand-icons.mjs
```

## Files

| File | Use |
| --- | --- |
| `logo-light.svg` | The mark and the word, on light backgrounds |
| `logo-dark.svg` | The mark and the word, on dark backgrounds |
| `mark-light.svg` | The mark alone, on light backgrounds; also the favicon (`app/icon.svg`) |
| `mark-dark.svg` | The mark alone, on dark backgrounds |
| `icon-192.png`, `icon-512.png` | Web app manifest icons (`app/manifest.ts`) |
| `icon-maskable-512.png` | Full-bleed manifest icon, for launchers that crop icons to a shape |

On the site itself, use `<Logo />` from `web/components/site/Logo.tsx` (`variant="mark"` for the mark
alone). It draws the same geometry with theme tokens, so it follows every theme in light and dark. The
files here use fixed colors, for places outside the site.

## Colors

From the default themes, codebases Light and codebases Dark (`web/lib/themes/catalog.generated.ts`):

| | Light | Dark |
| --- | --- | --- |
| Tile (accent) | `#2563eb` | `#4c8dff` |
| Glyph (accent ink) | `#ffffff` | `#0f141b` |
| Word (text) | `#111827` | `#e6edf3` |

Don't recolor the mark outside these pairs, add gradients, shadows or outlines, rotate it, or set the
word in another typeface or case.

## The word

The UI font stack (system UI: SF Pro on Apple platforms, Segoe UI on Windows, Roboto on Android),
bold, tracked in by 0.03em, at 1/1.4 of the mark's height, 0.42em after the mark. The lockup SVGs set
it as text in that stack with a fixed `textLength`, so a fallback font keeps the same width.

## Clear space and size

- Keep clear space around the logo of at least half the mark's height on every side.
- Minimum size: the mark at 16 px (favicon), the lockup with the mark at 20 px tall (about 14 px
  type). Below that, use the mark alone.
