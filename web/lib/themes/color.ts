// Small color helpers for building and checking themes. Colors are `#rrggbb` strings; WCAG
// contrast uses relative luminance. No dependency: the math is a few lines each.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHex(value: string): boolean {
  return HEX.test(value);
}

/** Parses #rgb, #rgba, #rrggbb or #rrggbbaa. Alpha is dropped. */
export function parseHex(value: string): Rgb {
  if (!isHex(value)) throw new Error(`Not a hex color: ${value}`);
  let hex = value.slice(1);
  if (hex.length <= 4) hex = [...hex.slice(0, 3)].map((char) => char + char).join("");
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((part) => Math.round(clamp(part, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

/** Normalizes any accepted hex to lowercase #rrggbb. */
export function normalizeHex(value: string): string {
  return toHex(parseHex(value));
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(color: string): number {
  const { r, g, b } = parseHex(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** True when white text reads better on this color than near-black text. */
export function isDark(color: string): boolean {
  return contrast(color, "#ffffff") >= contrast(color, "#000000");
}

/** `a` moved toward `b` by `amount` (0 keeps `a`, 1 gives `b`), in sRGB. */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex({
    r: x.r + (y.r - x.r) * amount,
    g: x.g + (y.g - x.g) * amount,
    b: x.b + (y.b - x.b) * amount,
  });
}

/** `rgb(r g b / n%)`, the only non-hex color form themes use. */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseHex(color);
  return `rgb(${r} ${g} ${b} / ${Math.round(alpha * 100)}%)`;
}

/** What `color` at `alpha` looks like over `background`. */
export function composite(color: string, alpha: number, background: string): string {
  return mix(background, color, alpha);
}

export function toHsl(color: string): Hsl {
  const { r, g, b } = parseHex(color);
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function fromHsl({ h, s, l }: Hsl): string {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const hue = (((h % 360) + 360) % 360) / 360;
  if (sn === 0) return toHex({ r: ln * 255, g: ln * 255, b: ln * 255 });
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const part = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return toHex({ r: part(hue + 1 / 3) * 255, g: part(hue) * 255, b: part(hue - 1 / 3) * 255 });
}

/** The smallest contrast of `color` against any of `backgrounds`. */
export function minContrast(color: string, backgrounds: readonly string[]): number {
  return Math.min(...backgrounds.map((background) => contrast(color, background)));
}

/**
 * `color` with its lightness moved, a step at a time, away from the backgrounds until it reaches
 * `ratio` against all of them. Hue and saturation are kept, so the color stays recognizable. If
 * no lightness is enough, the end of the range (black or white) is used.
 */
export function ensureContrast(color: string, backgrounds: readonly string[], ratio: number): string {
  if (minContrast(color, backgrounds) >= ratio) return normalizeHex(color);
  const hsl = toHsl(color);
  const darkBackground = backgrounds.every((background) => isDark(background));
  const lightBackground = backgrounds.every((background) => !isDark(background));
  const directions = darkBackground ? [1] : lightBackground ? [-1] : [1, -1];
  let best = normalizeHex(color);
  let bestRatio = minContrast(best, backgrounds);
  for (const direction of directions) {
    for (let step = 1; step <= 100; step++) {
      const candidate = fromHsl({ ...hsl, l: hsl.l + direction * step });
      const candidateRatio = minContrast(candidate, backgrounds);
      if (candidateRatio >= ratio) return candidate;
      if (candidateRatio > bestRatio) {
        best = candidate;
        bestRatio = candidateRatio;
      }
    }
  }
  const extremes = ["#ffffff", "#000000"].sort((a, b) => minContrast(b, backgrounds) - minContrast(a, backgrounds));
  return minContrast(extremes[0] ?? best, backgrounds) > bestRatio ? (extremes[0] ?? best) : best;
}

/** Hue distance in degrees, 0–180. */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(toHsl(a).h - toHsl(b).h) % 360;
  return d > 180 ? 360 - d : d;
}
