// Themes taken out of the catalog because their page background clashes with the fixed cream
// illustration plate and the mascot's colors (design spec section H). Keyed by the source preset's
// key, like THEME_NAMES, each with the reason. To bring one back, delete its line and run
// `UPDATE_THEMES=1 npx vitest run tests/themes.test.ts` in web/; its name and ID are unchanged.
//
// `node scripts/theme-clash.mjs` scores every theme, removed or not, and rewrites the contact
// sheet and list in docs/superpowers/specs/assets/. tests/themes.test.ts checks this list against
// that test, so a theme can't be dropped for another reason without saying so here.
//
// This file is small on purpose: the controller and the pre-paint script read the removed IDs
// without loading the catalog, so a browser that saved one of these falls back to the default.

export const REMOVED_THEMES: Readonly<Record<string, string>> = {
  menthol: "Spearmint: a vivid green page (#00d097) the same mint as the mascot's accent, so the plate reads as a hole and the mint disappears.",
  evil_eye: "Talisman: a vivid sky blue page (#38bfff); the cream plate looks dirty on it and the periwinkle goes gray.",
  deku: "Lagoon: a vivid cyan page (#07cbcc) that fights the mascot's mint and makes the cream plate look yellowed.",
  miami: "Neon Coast: a saturated pink page (#f898b7) against the mint and periwinkle; three loud colors around a cream card.",
  honey: "Beeswax: a saturated amber page (#f2aa00); the pale warm plate washes out on it and the periwinkle vibrates.",
  taro: "Ube: a periwinkle pastel page (#b3baff) close to the mascot's body color, so the mascot merges with the page and the plate looks yellow.",
  mexican: "Marigold Market: a saturated orange page (#f8ad34); the pale warm plate washes out on it and the periwinkle vibrates.",
  vaporwave: "Mall Fountain: a lavender page (#acafec) close to the mascot's body color, so the plate looks yellow and the mascot merges with the page.",
  frozen_llama: "Glacier Mint: a pale cyan page (#9bf2ea) near the mascot's mint; the cream plate looks dirty on it.",
  creamsicle: "Orange Pop: a saturated orange page (#ff9c6e) against the mint and periwinkle.",
  our_theme: "Signal Red: a crimson page (#830b18); the mint and periwinkle on cream clash hard with saturated red.",
  strawberry: "Berry Patch: a saturated salmon page (#f69b9e) against the mint and periwinkle.",
  red_samurai: "Lacquer: a crimson page (#7c1e29); the mint and periwinkle on cream clash with saturated red.",
  passion_fruit: "Guava: a magenta-red page (#782040); the mint and periwinkle on cream clash with it.",
};

/** The removed themes' IDs, as saved in preferences, favorites and the pre-paint cache. */
export const REMOVED_THEME_IDS: readonly string[] = Object.keys(REMOVED_THEMES).map((key) => key.replaceAll("_", "-"));

export function isRemovedTheme(id: string): boolean {
  return REMOVED_THEME_IDS.includes(id);
}
