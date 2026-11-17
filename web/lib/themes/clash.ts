import { toOklch } from "./color";

// Whether a theme's page background clashes with the fixed cream illustration plate and the
// mascot's colors (design spec section H). Used by scripts/theme-clash.mjs, which draws the
// contact sheet, and by tests/themes.test.ts, which checks lib/themes/removed.ts against it.
// Never imported by the app.
//
// The spec's first proposal was "chroma 0.06 or more, or opposite the plate's hue above 0.03".
// On the contact sheet that took out more than a quarter of the themes, most of them dark navy
// and teal pages the cream plate sits on comfortably, so it's tightened to the unmistakable ones:
//   - lightness below 0.20: never a clash. That close to black, chroma doesn't read as a color.
//   - a dark background (lightness below 0.50) in the mascot's own blue-violet family (hue within
//     45 degrees of 278): never a clash. The navy outline and periwinkle body belong to it.
//   - any other dark background: a clash at chroma 0.12 or more (crimson, magenta).
//   - a light warm background (hue within 60 degrees of the plate's 70): a clash at chroma 0.10 or
//     more (a saturated orange or salmon field). Pale yellows and tans stay.
//   - any other light background: a clash at chroma 0.06 or more. A cool or pink pastel makes the
//     cream plate look dirty, and a vivid one fights the mint and periwinkle.
// The accent and the raised surface aren't scored: an accent near the mascot's colors is fine.

export const CLASH_LIMITS = {
  nearBlack: 0.2,
  dark: 0.5,
  plateHue: 70,
  warmWithin: 60,
  mascotHue: 278,
  mascotWithin: 45,
  darkChroma: 0.12,
  warmChroma: 0.1,
  lightChroma: 0.06,
} as const;

export interface Clash {
  /** Chroma over the limit for this kind of background: 1 or more is a clash. */
  score: number;
  clash: boolean;
  reason: string;
}

const hueGap = (a: number, b: number) => {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
};

export function clashOf(background: string): Clash {
  const { l, c, h } = toOklch(background);
  const where = `lightness ${l.toFixed(2)}, chroma ${c.toFixed(3)}, hue ${h.toFixed(0)}`;
  const none = (reason: string): Clash => ({ score: 0, clash: false, reason: `${reason} (${where})` });
  if (l < CLASH_LIMITS.nearBlack) return none("near black, where chroma doesn't read as a color");
  const dark = l < CLASH_LIMITS.dark;
  if (dark && hueGap(h, CLASH_LIMITS.mascotHue) <= CLASH_LIMITS.mascotWithin) {
    return none("dark background in the mascot's own blue-violet family");
  }
  const warm = hueGap(h, CLASH_LIMITS.plateHue) <= CLASH_LIMITS.warmWithin;
  const limit = dark ? CLASH_LIMITS.darkChroma : warm ? CLASH_LIMITS.warmChroma : CLASH_LIMITS.lightChroma;
  const kind = dark ? "dark" : warm ? "light warm" : "light";
  const score = c / limit;
  if (score < 1) return { score, clash: false, reason: `${kind} background under the limit of ${limit} (${where})` };
  const effect = dark || warm ? "the cream plate and the mascot's mint and periwinkle fight it" : "the cream plate looks dirty on it";
  return { score, clash: true, reason: `saturated ${kind} background, over the limit of ${limit}: ${effect} (${where})` };
}
