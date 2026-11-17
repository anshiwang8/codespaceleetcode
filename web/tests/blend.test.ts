import { describe, expect, it } from "vitest";
import { THEMES } from "@/lib/themes/catalog.generated";
import { contrast, parseHex, toHex } from "@/lib/themes/color";
import { DEFAULT_LIGHT_TOKENS } from "@/lib/themes/derive";
import type { ThemeTokens } from "@/lib/themes/tokens";

// A highlighted line of code (the landing demo's picked line, a selected Learn line) is an
// --accent-soft tint blended over --editor-bg with --blend-tint: screen in light themes,
// multiply in dark ones (app/globals.css). Every color drawn on that line must still reach 4.5:1.

type Mode = "screen" | "multiply";

function parse(value: string): { r: number; g: number; b: number; a: number } {
  const match = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(value);
  if (match) return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: Number(match[4]) / 100 };
  return { ...parseHex(value), a: 1 };
}

/** The CSS result of `background: linear-gradient(tint, tint), base; background-blend-mode: mode`. */
function blended(base: string, tint: string, mode: Mode): string {
  const b = parseHex(base);
  const t = parse(tint);
  const mix = (cb: number, cs: number) => (mode === "multiply" ? (cb * cs) / 255 : 255 - ((255 - cb) * (255 - cs)) / 255);
  const channel = (cb: number, cs: number) => cb + t.a * (mix(cb, cs) - cb);
  return toHex({ r: channel(b.r, t.r), g: channel(b.g, t.g), b: channel(b.b, t.b) });
}

const ON_CODE = [
  "text",
  "syntax-keyword",
  "syntax-function",
  "syntax-type",
  "syntax-string",
  "syntax-number",
  "syntax-comment",
  "editor-line-number",
] as const satisfies readonly (keyof ThemeTokens)[];

const themes = [{ id: "default-light", scheme: "light" as const, tokens: DEFAULT_LIGHT_TOKENS }, ...THEMES];

describe("blended code-line highlight", () => {
  it.each(themes.map((theme) => [theme.id, theme] as const))("%s keeps 4.5:1 for code on the highlight", (_, theme) => {
    const mode: Mode = theme.scheme === "dark" ? "multiply" : "screen";
    const line = blended(theme.tokens["editor-bg"], theme.tokens["accent-soft"], mode);
    for (const token of ON_CODE) {
      expect(contrast(theme.tokens[token], line), `${token} on the highlight`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
