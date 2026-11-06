import {
  composite,
  contrast,
  ensureContrast,
  fromHsl,
  hueDistance,
  isDark,
  minContrast,
  mix,
  normalizeHex,
  toHsl,
  withAlpha,
} from "./color";
import type { ColorScheme, ThemeTokens } from "./tokens";

// Turns a source palette into codebases' semantic tokens. A source palette has a background, an
// accent, body and secondary text, a second surface and an error color. codebases needs more than
// that (status, difficulty, data, syntax), so the rest is derived, and every text and state color
// is moved, if needed, until it meets its contrast target on every surface it's drawn on.

export interface SourcePalette {
  bg: string;
  main: string;
  caret: string;
  sub: string;
  subAlt: string;
  text: string;
  error: string;
}

export interface Derived {
  scheme: ColorScheme;
  tokens: ThemeTokens;
  /** Plain-language notes on colors moved away from the source to meet a target. */
  adjustments: string[];
}

/** Contrast targets. Text is WCAG AA (4.5), body text AAA (7); non-text indicators 3. */
export const TARGETS = {
  text: 7,
  secondaryText: 4.5,
  indicator: 3,
} as const;

const WHITE = "#ffffff";

/** How far from mid-gray a background must be: the best of black or white text reaches this. */
const BACKGROUND_REACH = 10;

/** A status color that reads on the surfaces and on its own tint (the soft background behind it). */
function readableOnTint(color: string, alpha: number, bg: string, surfaces: readonly string[]): string {
  let current = color;
  for (let round = 0; round < 6; round++) {
    const next = ensureContrast(current, [...surfaces, composite(current, alpha, bg)], TARGETS.secondaryText);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** A fill and the text color drawn on it: the ink that reads best, and a fill moved until it reads well. */
function fillWithInk(fill: string, page: string, inks: readonly string[]): { fill: string; ink: string } {
  let best: { fill: string; ink: string; score: number } | null = null;
  for (const ink of inks) {
    // Move the fill away from the ink until the ink reads on it, keeping its hue.
    const readable = ensureContrast(fill, [ink], TARGETS.secondaryText);
    // A button must also stand out from the page it sits on.
    const visible = contrast(readable, page) >= TARGETS.indicator;
    const change = Math.abs(toHsl(readable).l - toHsl(fill).l);
    const score = (visible ? 0 : 1000) + change;
    if (!best || score < best.score) best = { fill: readable, ink, score };
  }
  if (!best) throw new Error("no ink");
  if (contrast(best.fill, page) < TARGETS.indicator) {
    // Rare: no lightness of this hue reads with an ink and stands out from the page. Push the
    // fill to the far side of the page instead, keeping the ink readable.
    const far = ensureContrast(best.fill, [page], TARGETS.indicator);
    const ink = contrast(far, WHITE) >= contrast(far, "#000000") ? WHITE : "#111111";
    return { fill: far, ink };
  }
  return { fill: best.fill, ink: best.ink };
}

const lightness = (color: string) => toHsl(color).l;
const saturation = (color: string) => toHsl(color).s;

/** A status hue in this palette's mood: saturation borrowed from the accent, kept in a sane range. */
function statusColor(hue: number, accent: string, surfaces: readonly string[], dark: boolean): string {
  const s = Math.min(Math.max(saturation(accent), 45), 80);
  const start = fromHsl({ h: hue, s, l: dark ? 62 : 38 });
  return ensureContrast(start, surfaces, TARGETS.secondaryText);
}

function isReddish(color: string): boolean {
  const { h, s } = toHsl(color);
  return s >= 30 && (h <= 25 || h >= 330);
}

export function deriveTheme(source: SourcePalette): Derived {
  const adjustments: string[] = [];
  let bg = normalizeHex(source.bg);
  const dark = isDark(bg);
  // A background near mid-gray can't carry 7:1 text in any color. Move its lightness toward its
  // own side (darker for a dark theme, lighter for a light one), keeping its hue.
  const reach = (color: string) => Math.max(contrast(color, WHITE), contrast(color, "#000000"));
  if (reach(bg) < BACKGROUND_REACH) {
    const original = bg;
    const hsl = toHsl(bg);
    for (let step = 1; step <= 60 && reach(bg) < BACKGROUND_REACH; step++) {
      bg = fromHsl({ ...hsl, l: hsl.l + (dark ? -step : step) });
    }
    adjustments.push(`background lightness ${lightness(original).toFixed(0)}→${lightness(bg).toFixed(0)}% so text can reach 7:1`);
  }
  const scheme: ColorScheme = dark ? "dark" : "light";
  const ink = normalizeHex(source.text);

  // Surfaces: the source's second surface when it's a gentle step from the background, otherwise
  // a small step toward the text color.
  const subAlt = normalizeHex(source.subAlt);
  const subtleAlt = contrast(subAlt, bg) > 1.02 && contrast(subAlt, bg) < 1.45;
  const panelRaised = subtleAlt ? subAlt : mix(bg, ink, dark ? 0.06 : 0.035);
  const surfaceSunken = mix(bg, ink, dark ? 0.035 : 0.02);
  const hover = mix(bg, ink, dark ? 0.09 : 0.05);
  const inputBg = dark ? mix(bg, ink, 0.03) : bg;
  const surfaces = [bg, panelRaised, surfaceSunken, inputBg];

  // Text.
  const text = ensureContrast(ink, [...surfaces, hover], TARGETS.text);
  if (text !== ink) adjustments.push(`text ${contrast(ink, bg).toFixed(1)}→${contrast(text, bg).toFixed(1)}:1`);
  const textMuted = ensureContrast(mix(text, bg, 0.25), [...surfaces, hover], TARGETS.secondaryText);
  const sub = normalizeHex(source.sub);
  const textFaint = ensureContrast(sub, [...surfaces, hover], TARGETS.secondaryText);
  if (textFaint !== sub) {
    adjustments.push(`secondary text ${contrast(sub, bg).toFixed(1)}→${contrast(textFaint, bg).toFixed(1)}:1`);
  }

  // Accent. A palette whose accent is its text color (monochrome) takes its caret color instead,
  // when that's a real color, so the accent still marks something.
  let accentSource = normalizeHex(source.main);
  const caret = normalizeHex(source.caret);
  if (contrast(accentSource, text) < 1.25 && saturation(caret) > 20 && contrast(caret, text) >= 1.25) {
    accentSource = caret;
    adjustments.push("accent taken from the caret color, since the main color matches the text");
  }
  const { fill: accent, ink: accentInk } = fillWithInk(accentSource, bg, [WHITE, dark ? bg : "#111111"]);
  if (Math.abs(lightness(accent) - lightness(accentSource)) > 3) {
    adjustments.push(`button accent lightness ${lightness(accentSource).toFixed(0)}→${lightness(accent).toFixed(0)}% so its label reads`);
  }
  const accentHover = ensureContrast(
    fromHsl({ ...toHsl(accent), l: lightness(accent) + (isDark(accentInk) ? 6 : -6) }),
    [accentInk],
    TARGETS.secondaryText,
  );
  const accentSoft = withAlpha(accentSource, dark ? 0.2 : 0.12);
  const accentSofter = withAlpha(accentSource, dark ? 0.1 : 0.06);
  const softOverPanel = composite(accentSource, dark ? 0.2 : 0.12, bg);
  const accentText = ensureContrast(accentSource, [...surfaces, hover, softOverPanel], TARGETS.secondaryText);

  if (Math.abs(lightness(accentText) - lightness(accentSource)) > 3) {
    adjustments.push(`accent as text ${contrast(accentSource, bg).toFixed(1)}→${contrast(accentText, bg).toFixed(1)}:1`);
  }
  const focus = ensureContrast(accentText, surfaces, TARGETS.indicator);

  // Status. Success is always green and warning amber; failure keeps the source's error color
  // when it's red, and is red otherwise, so the three never trade places with the accent.
  const okSoftAlpha = dark ? 0.16 : 0.1;
  const ok = readableOnTint(statusColor(142, accentSource, surfaces, dark), okSoftAlpha, bg, surfaces);
  const warn = readableOnTint(statusColor(32, accentSource, surfaces, dark), okSoftAlpha, bg, surfaces);
  const sourceError = normalizeHex(source.error);
  const badStart = isReddish(sourceError) ? sourceError : fromHsl({ h: 356, s: Math.max(saturation(accentSource), 60), l: dark ? 62 : 42 });
  if (!isReddish(sourceError)) adjustments.push("error color set to red, since the source's isn't red");
  const badSoftAlpha = dark ? 0.14 : 0.08;
  const bad = readableOnTint(badStart, badSoftAlpha, bg, surfaces);
  const { fill: badFill, ink: badInk } = fillWithInk(bad, bg, [WHITE, "#111111"]);
  const badHover = ensureContrast(
    fromHsl({ ...toHsl(badFill), l: lightness(badFill) + (isDark(badInk) ? 6 : -6) }),
    [badInk],
    TARGETS.secondaryText,
  );

  // Data: five steps from a quiet zero to the accent, the strongest one clearly visible.
  const heat0 = mix(bg, text, dark ? 0.1 : 0.07);
  const heat4 = ensureContrast(accentSource, [bg], TARGETS.indicator);
  const heat = [heat0, mix(heat0, heat4, 0.3), mix(heat0, heat4, 0.55), mix(heat0, heat4, 0.78), heat4];

  // Code: hues spread around the wheel from the accent, each readable on the editor.
  const editorBg = bg;
  const code = [editorBg, mix(bg, text, 0.06)];
  const accentHue = toHsl(accentSource).h;
  const syntax = (hue: number) =>
    ensureContrast(fromHsl({ h: hue, s: Math.min(Math.max(saturation(accentSource), 45), 75), l: dark ? 68 : 36 }), code, TARGETS.secondaryText);
  const keyword = ensureContrast(isReddish(sourceError) ? sourceError : fromHsl({ h: 350, s: 65, l: dark ? 68 : 40 }), code, TARGETS.secondaryText);
  const func = ensureContrast(accentSource, code, TARGETS.secondaryText);
  let type = syntax(30);
  if (hueDistance(type, keyword) < 25 || hueDistance(type, func) < 25) type = syntax(48);
  let str = syntax(accentHue + 150);
  if (hueDistance(str, keyword) < 30 || hueDistance(str, func) < 30) str = syntax(accentHue + 200);
  const num = syntax(accentHue + 210);

  const tokens: ThemeTokens = {
    bg,
    panel: bg,
    "panel-raised": panelRaised,
    "surface-sunken": surfaceSunken,
    "input-bg": inputBg,
    "editor-bg": editorBg,
    hover,
    overlay: withAlpha("#000000", dark ? 0.6 : 0.4),
    line: mix(bg, text, dark ? 0.16 : 0.1),
    "line-strong": mix(bg, text, dark ? 0.3 : 0.2),
    text,
    "text-muted": textMuted,
    "text-faint": textFaint,
    accent,
    "accent-hover": accentHover,
    "accent-text": accentText,
    "accent-ink": accentInk,
    "accent-soft": accentSoft,
    "accent-softer": accentSofter,
    focus,
    ok,
    "ok-soft": withAlpha(ok, okSoftAlpha),
    warn,
    "warn-soft": withAlpha(warn, okSoftAlpha),
    bad,
    "bad-soft": withAlpha(bad, badSoftAlpha),
    "bad-fill": badFill,
    "bad-hover": badHover,
    "bad-ink": badInk,
    easy: ok,
    medium: warn,
    hard: bad,
    "heat-0": heat[0] ?? heat0,
    "heat-1": heat[1] ?? heat0,
    "heat-2": heat[2] ?? heat0,
    "heat-3": heat[3] ?? heat0,
    "heat-4": heat4,
    "chart-line": ensureContrast(accentText, [bg], TARGETS.indicator),
    "syntax-keyword": keyword,
    "syntax-function": func,
    "syntax-type": type,
    "syntax-string": str,
    "syntax-number": num,
    "syntax-comment": ensureContrast(textFaint, code, TARGETS.secondaryText),
    "editor-selection": withAlpha(accentSource, dark ? 0.3 : 0.2),
    "editor-line-highlight": mix(bg, text, dark ? 0.06 : 0.035),
    "editor-line-number": ensureContrast(mix(textFaint, bg, 0.2), code, TARGETS.secondaryText),
    // A neutral gray that a white silhouette reads on (4.5:1 or better) on any page.
    "avatar-bg": dark ? "#4b5563" : "#6b7280",
    "avatar-fg": WHITE,
    shadow: withAlpha("#000000", dark ? 0.5 : 0.12),
    "shadow-soft": withAlpha("#000000", dark ? 0.25 : 0.04),
    scrollbar: withAlpha(text, dark ? 0.2 : 0.12),
  };
  return { scheme, tokens, adjustments };
}

/** codebases' own light theme: exactly the values app/globals.css has always used. */
export const DEFAULT_LIGHT_TOKENS: ThemeTokens = {
  bg: "#ffffff",
  panel: "#ffffff",
  "panel-raised": "#f6f8fa",
  "surface-sunken": "#f8fafc",
  "input-bg": "#ffffff",
  "editor-bg": "#ffffff",
  hover: "#f3f4f6",
  overlay: "rgb(0 0 0 / 40%)",
  line: "#e5e7eb",
  "line-strong": "#d1d5db",
  text: "#111827",
  "text-muted": "#4b5563",
  "text-faint": "#6b7280",
  accent: "#2563eb",
  "accent-hover": "#1d4ed8",
  "accent-text": "#1d4ed8",
  "accent-ink": "#ffffff",
  "accent-soft": "rgb(37 99 235 / 10%)",
  "accent-softer": "rgb(37 99 235 / 5%)",
  focus: "#2563eb",
  ok: "#15803d",
  // 7%, not 10%: green and amber status text needs 4.5:1 on its own tint, and 10% gave 4.4.
  "ok-soft": "rgb(21 128 61 / 7%)",
  warn: "#b45309",
  "warn-soft": "rgb(180 83 9 / 7%)",
  bad: "#b91c1c",
  "bad-soft": "rgb(185 28 28 / 8%)",
  "bad-fill": "#b91c1c",
  "bad-hover": "#991b1b",
  "bad-ink": "#ffffff",
  easy: "#15803d",
  medium: "#b45309",
  hard: "#b91c1c",
  "heat-0": "#eef0f3",
  "heat-1": "#c7d7fb",
  "heat-2": "#8eb0f5",
  "heat-3": "#4f83ee",
  "heat-4": "#1d4ed8",
  "chart-line": "#2563eb",
  "syntax-keyword": "#cf222e",
  "syntax-function": "#8250df",
  "syntax-type": "#953800",
  "syntax-string": "#0a3069",
  "syntax-number": "#0550ae",
  "syntax-comment": "#6a737d",
  "editor-selection": "rgb(37 99 235 / 20%)",
  "editor-line-highlight": "#f6f8fa",
  // Line numbers are text: #6b7280 meets 4.5:1 on white, where the old #9ca3af didn't.
  "editor-line-number": "#6b7280",
  "avatar-bg": "#6b7280",
  "avatar-fg": "#ffffff",
  shadow: "rgb(17 24 39 / 12%)",
  "shadow-soft": "rgb(17 24 39 / 4%)",
  scrollbar: "rgb(17 24 39 / 8%)",
};

/** The palette codebases' own dark theme is derived from: the same blue accent on near-black. */
export const DEFAULT_DARK_SOURCE: SourcePalette = {
  bg: "#0f141b",
  main: "#4c8dff",
  caret: "#4c8dff",
  sub: "#8b96a5",
  subAlt: "#161d27",
  text: "#e6edf3",
  error: "#f85149",
};

export { minContrast };
