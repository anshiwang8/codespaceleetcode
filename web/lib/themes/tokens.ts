// The semantic color tokens every theme defines. Each is a CSS custom property (`--name`) set on
// the root element; app/globals.css holds the default light values as the no-JavaScript fallback.

export const TOKEN_NAMES = [
  // Surfaces
  "bg",
  "panel",
  "panel-raised",
  "surface-sunken",
  "input-bg",
  "editor-bg",
  "hover",
  "overlay",
  // Lines
  "line",
  "line-strong",
  // Text
  "text",
  "text-muted",
  "text-faint",
  // Accent and states
  "accent",
  "accent-hover",
  "accent-text",
  "accent-ink",
  "accent-soft",
  "accent-softer",
  "focus",
  // Status
  "ok",
  "ok-soft",
  "warn",
  "warn-soft",
  "bad",
  "bad-soft",
  "bad-fill",
  "bad-hover",
  "bad-ink",
  // Difficulty
  "easy",
  "medium",
  "hard",
  // Data
  "heat-0",
  "heat-1",
  "heat-2",
  "heat-3",
  "heat-4",
  "chart-line",
  // Code
  "syntax-keyword",
  "syntax-function",
  "syntax-type",
  "syntax-string",
  "syntax-number",
  "syntax-comment",
  "editor-selection",
  "editor-line-highlight",
  "editor-line-number",
  // Avatar
  "avatar-bg",
  "avatar-fg",
  // Depth
  "shadow",
  "shadow-soft",
  "scrollbar",
] as const;

export type TokenName = (typeof TOKEN_NAMES)[number];
export type ThemeTokens = Record<TokenName, string>;
export type ColorScheme = "light" | "dark";

export interface ThemeDefinition {
  /** Stable and independent of the name; saved in preferences. */
  id: string;
  /** Shown in the picker. */
  name: string;
  scheme: ColorScheme;
  /** The Monkeytype preset it's adapted from, or null for codebases' own defaults. */
  source: string | null;
  tokens: ThemeTokens;
}

/**
 * Values a theme token may hold: `#rrggbb`, or `rgb(r g b / n%)`. The pre-paint script and the
 * runtime apply only values of this shape, so a stored preference can't inject other CSS.
 */
export const TOKEN_VALUE = /^(#[0-9a-f]{6}|rgb\((25[0-5]|2[0-4]\d|1?\d?\d) (25[0-5]|2[0-4]\d|1?\d?\d) (25[0-5]|2[0-4]\d|1?\d?\d) \/ (100|\d?\d)%\))$/;

export const DEFAULT_LIGHT_ID = "default-light";
export const DEFAULT_DARK_ID = "default-dark";
