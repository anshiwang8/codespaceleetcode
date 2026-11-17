# UI phase 2: brand themes, springy buttons, animated group index, smooth section scrolling

Date: 2026-11-17. Branch: `design/ui-polish-2`, stacked on `design/learn-challenges` (PR #22).

## Intent

The owner asked for a second UI pass after the Learn, Challenges and brand redesign:

1. Remove every theme that does not fit the current design. Keep codebases Light, codebases Dark
   and a few simple, softer color versions.
2. Animate the Learn group index and place it so it fills the empty space beside the path.
3. Buttons that give when pressed and bounce when released. The motion must be fluid: a half-press
   that is canceled must look like one.
4. Remove the "How it works" section from `/learn`.
5. Clicking a section link scrolls to it instead of jumping.

## Goals

- Eight themes, all of which sit well behind the cream plate and the mascot.
- Press and release feel physical on every button, and stay interruptible.
- The group index reads as a progress card and moves with the page.
- No layout shift from any of this, and nothing moves under reduced motion.

## Non-goals

- No change to lesson content, grading, challenges logic or the database schema.
- No new theme-editing feature. Themes stay a fixed list.
- The puzzle workspace keeps its motion rules: Monaco, tree targets, editor tabs and splitters
  are never animated.

## Anti-goals

- A bounce that loops, or that plays on hover, on load or on anything but a release.
- A press animation written as keyframes, which would restart or finish instead of reversing.
- Smooth scrolling that fights the reader: it applies to in-page link clicks only, never to
  route changes, back/forward or focus moves.

## Approaches

**Themes.** (a) Author six new palettes from the mascot's colors and derive tokens with the
existing `deriveTheme` and its contrast targets. (b) Keep about six of the current 175
Monkeytype-derived presets. The owner chose (a): the palettes fit by construction, the clash test
and removal list become unnecessary, and the names relate to the brand.

**Button spring.** (a) A CSS transition on `transform` with two timing functions: a short
ease-out while `:active`, and a spring curve written with `linear()` on the way back, so release
overshoots once and settles. Because it is a transition, releasing early or dragging off retargets
from the current scale. (b) A JavaScript spring (Web Animations API or a library) driven by
pointer events. Chosen: (a). It needs no script, cannot desync from the pointer, and matches the
project rule that state changes are transitions. `linear()` is supported by every current
browser; older ones fall back to the existing ease.

**Section scrolling.** (a) `scroll-behavior: smooth` on the root, scoped by a class while an
in-page index link is followed. (b) `element.scrollIntoView({ behavior: "smooth" })` in the click
handler, with the hash updated by `history.replaceState`. Chosen: (b). It keeps route changes and
back/forward instant, lets the handler honor reduced motion explicitly, and lets the index marker
lock to the clicked item until the scroll ends.

## The design

### A. Themes

- A1. The catalog becomes eight themes: `default-light` (codebases Light), `default-dark`
  (codebases Dark), and six brand themes. Working names and intent (final hex values are the
  builder's, within the contrast tests):

  | ID | Name | Scheme | Background idea | Accent |
  | --- | --- | --- | --- | --- |
  | `cream` | Cream | light | the plate's cream | periwinkle deep |
  | `periwinkle-mist` | Periwinkle mist | light | very pale periwinkle | periwinkle deep |
  | `mint-mist` | Mint mist | light | very pale mint | teal |
  | `ink` | Ink | dark | the mascot's navy ink | periwinkle |
  | `dusk` | Dusk | dark | muted deep periwinkle | mint |
  | `pine` | Pine | dark | deep desaturated teal | mint |

- A2. Source palettes live in `web/lib/themes/brand-palettes.ts` as `SourcePalette` entries. The
  generator in `web/tests/themes.test.ts` reads them instead of
  `docs/themes/monkeytype-presets.json`. Every theme must pass the existing contrast checks; no
  target is loosened.
- A3. Removed: `names.ts`, `removed.ts`, `clash.ts`, `web/scripts/theme-clash.mjs`,
  `docs/themes/monkeytype-presets.json` and the Monkeytype mapping and credit (no adapted
  palettes remain). `docs/themes/MAPPING.md` is regenerated as a plain list of the eight.
- A4. A saved theme ID that is no longer in the catalog falls back to codebases Light on the
  server (`appearanceFrom`), in the controller and in the pre-paint script. The check is "not one
  of the eight known IDs", from a small static list in `tokens.ts`, so it never loads the catalog.
- A5. The picker shrinks to match: a grid of eight swatches with the preview, Apply, Cancel and
  Restore default. Search, the All/Light/Dark/Favorites tabs and favorites are removed from the
  UI. `user_preferences.favorite_themes` stays in the database unused (no migration); the API
  ignores it. (Lead's call; say so if favorites should stay.)
- A6. The catalog stays a dynamic import, and the default theme still never loads it.
- A7. Copy that says "175 themes" changes (Settings, `spec.md`, `docs/themes/README.md`,
  `VISUAL_REVIEW.md`, `CLAUDE.md`).

### B. Buttons

- B1. Tokens in the "Craft foundation" block: `--press-scale: 0.96`, `--press-in: 90ms` with an
  ease-out, `--press-out: 420ms` with `--spring-release`, a `linear()` curve that overshoots to
  about 1.03 once and settles. Fallback for browsers without `linear()`: the current 160ms ease.
- B2. `.btn` uses the release timing by default and the press timing under `:active`, so pressing
  is quick and letting go springs. Dragging off the button before release ends `:active`, which
  plays the same spring back from wherever the press reached.
- B3. The same behavior, at a gentler scale (0.985), on the large pressable surfaces: lesson rows
  (`LessonNode`), the Continue panel button, challenge bars' buttons, the start choices and the
  group index links. Small icon buttons use 0.92.
- B4. The primary button's press highlight (`PressOrigin`) stays and fades on the release timing.
- B5. Under `prefers-reduced-motion` the transform is removed; only the color change remains.
- B6. `CLAUDE.md`'s motion rule changes in the same commit: buttons spring once on release; the
  correct-result check mark keeps its bounce; nothing loops or floats; the workspace exclusions
  stay.
- B7. `web/tests/foundation.test.ts` asserts the tokens, that the press is a transition (no
  `animation` on `.btn`), the `linear()` fallback and the reduced-motion rule.

### C. Group index (`/learn`)

- C1. At 1100px and wider it becomes a sticky card (`--surface-1`, subtle border) titled "Your
  path", in a wider right column (about 280px) so it fills the space the bare list left empty.
- C2. Contents: the four groups, each with its number, title, "n of m" count in tabular numbers
  and a thin progress bar that fills with a transition when progress loads or changes. Above them,
  one line with the whole course's count.
- C3. One marker element slides along the left track to the current group with a transform
  transition (`translateY` and `scaleY`), instead of four borders switching color.
- C4. A group whose lessons are all complete shows the check icon through `SwapIcon`.
- C5. Below 1100px it is a sticky row of four chips under the site header (number, short title,
  count), scrolling sideways with `fade-edges-x`; the current chip is scrolled into view.
- C6. Heights are reserved before progress loads, as now, so nothing shifts.
- C7. Links are 44px tall under a coarse pointer and take the gentle press from B3.

### D. "How it works"

- D1. The section and its three facts are removed from `app/(app)/learn/page.tsx`, with its
  styles if nothing else uses them. The page lede and "Where to start" stay.
- D2. Tests and e2e that mention it are updated.

### E. Section scrolling

- E1. One client helper, `web/components/site/SmoothAnchor.tsx` (or a hook), used by the group
  index and the lesson page's section index. On click of an in-page link it scrolls the target
  into view smoothly, updates the hash with `replaceState`, and moves focus to the target heading
  (`tabindex="-1"`) when the scroll ends, so keyboard and screen-reader users land there.
- E2. Targets get `scroll-margin-top` equal to the sticky header (and the chip row on narrow
  screens), so the heading is never hidden.
- E3. While a click-driven scroll runs, the index marker locks to the clicked item; the
  IntersectionObserver resumes on `scrollend` (with a timeout fallback).
- E4. Under reduced motion the helper jumps instantly. Modified clicks (new tab) are left alone.

## Verification

- Lint, typecheck, `pnpm test`, `pnpm validate`, `pnpm smoke`, `pnpm e2e`.
- New or updated tests: theme catalog (eight, contrast), fallback for an unknown saved ID
  (server, controller, pre-paint), foundation (B7), Learn e2e (index click scrolls and marks the
  group; "How it works" is gone; no sideways scroll at 375px).
- Visual check of `/learn`, a lesson, `/challenges` and Settings → Appearance at 1440 and 375
  wide, in all eight themes, including a slow press, a canceled press and a drag-off.
- Landing screenshots are recaptured only if the workspace changed visibly.
- `DEVLOG.md`, `CLAUDE.md` and `spec.md` updated in the same change.

## Left to the builder

Exact hex values and curve stops, the card's spacing, and whether the chip row or the card needs
its own component file.
