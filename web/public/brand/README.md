# codebases brand files

The name is always **codebases**: one word, all lowercase, even at the start of a sentence.

## The mark

The mascot: a small round-faced reader in a periwinkle cap with a `</>` badge, hands on the cap, two
mint spark lines beside it. The **head** is the mark. The **full** figure, seated and holding a
magnifying glass with `</>` in it, is used on the site's pages (`web/components/site/Mascot.tsx`),
never as the logo.

The one copy of the geometry is `web/components/site/mascot-geometry.ts`, redrawn as vector shapes
from the owner's reference image. Everything here, `web/app/icon.svg` and `web/app/apple-icon.png`
are written from it by `web/scripts/brand-icons.mjs`; never edit them by hand. The favicon and app
icons use a simplified head (no sparks, blush or highlights) so it reads at 16 px. After changing
the geometry or the colors, run from `web/`:

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
alone). It draws the same geometry; the word follows each theme's text color. The
files here use fixed colors, for places outside the site.

## Colors

The mascot's colors are fixed on every theme (`--mascot-*` in `web/app/globals.css`, with the same
hex values in `mascot-geometry.ts`):

| | Hex |
| --- | --- |
| Body | `#959ffd` |
| Cap and shade | `#5c5fcf` |
| Mint | `#88f8d0` |
| Teal (magnifier) | `#1f9bb0` |
| Outline | `#121650` |
| Face | `#ffffff` |
| Blush | `#ffdfdc` |
| Tongue | `#ff9f9e` |
| Plate (icon background) | `#fcf7f2` |

On a dark background a light edge (`#f1f2fb` at 85%) sits behind the outline. The word takes the
text color: `#111827` on light, `#e6edf3` on dark. Don't recolor the mascot, add gradients or
shadows, rotate it, or animate it in a loop.

## The word

"codebases" in rounded bold lowercase letters, drawn as one path (no font), filled with the text
color. In the lockup the head is aligned to the word's x-height band, not to its box.

## Clear space and size

- Keep clear space around the logo of at least half the mark's height on every side.
- Minimum size: the mark at 16 px (favicon), the lockup with the mark at 20 px tall (about 14 px
  type). Below that, use the mark alone.
