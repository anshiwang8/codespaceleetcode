import type { SourcePalette } from "./derive";

// The six brand themes, authored from the mascot's colors (`--mascot-*` in app/globals.css:
// periwinkle #959ffd, deep periwinkle #5c5fcf, mint #88f8d0, teal #1f9bb0, ink #121650) and the
// illustration plate's cream (#fcf7f2). Each is a source palette that lib/themes/derive.ts turns
// into the full token set, moving any color that misses its contrast target. Backgrounds are soft
// and low in chroma, so the cream plate and the mascot sit on every one of them.
//
// Never imported by the app: tests/themes.test.ts reads this and writes catalog.generated.ts.
// After a change run `UPDATE_THEMES=1 npx vitest run tests/themes.test.ts` in web/. The IDs must
// match KNOWN_THEME_IDS in tokens.ts, and an ID is never reused or renamed, since it's what
// accounts and browsers have saved.

export interface BrandPalette {
  /** Stable; saved in preferences. */
  id: string;
  /** Shown in the picker. */
  name: string;
  palette: SourcePalette;
}

export const BRAND_PALETTES: readonly BrandPalette[] = [
  {
    // The plate's cream as the page, with the mascot's ink for text and deep periwinkle to act.
    id: "cream",
    name: "Cream",
    palette: { bg: "#fcf7f2", main: "#5c5fcf", caret: "#5c5fcf", sub: "#68647a", subAlt: "#f5eee6", text: "#121650", error: "#c2364a" },
  },
  {
    // A very pale periwinkle page.
    id: "periwinkle-mist",
    name: "Periwinkle mist",
    palette: { bg: "#f4f5ff", main: "#5c5fcf", caret: "#5c5fcf", sub: "#5f6389", subAlt: "#eaecfb", text: "#121650", error: "#c2364a" },
  },
  {
    // A very pale mint page, with the mascot's teal, deepened so a white label reads on it, to act.
    id: "mint-mist",
    name: "Mint mist",
    palette: { bg: "#f1faf6", main: "#157a8c", caret: "#157a8c", sub: "#516a72", subAlt: "#e5f4ee", text: "#102f3c", error: "#c2364a" },
  },
  {
    // The mascot's navy ink as the page, a little quieter, with its periwinkle to act.
    id: "ink",
    name: "Ink",
    palette: { bg: "#161940", main: "#959ffd", caret: "#959ffd", sub: "#9ca2d2", subAlt: "#1e2250", text: "#e9ebff", error: "#ff6b7d" },
  },
  {
    // A muted deep periwinkle page, lighter than Ink, with mint to act.
    id: "dusk",
    name: "Dusk",
    palette: { bg: "#2a2c4e", main: "#88f8d0", caret: "#88f8d0", sub: "#a6aacf", subAlt: "#33365d", text: "#eceefb", error: "#ff6b7d" },
  },
  {
    // A deep, desaturated teal page with mint to act.
    id: "pine",
    name: "Pine",
    palette: { bg: "#13302f", main: "#88f8d0", caret: "#88f8d0", sub: "#97b8b3", subAlt: "#1b3c3a", text: "#e6f4f0", error: "#ff6b7d" },
  },
];
