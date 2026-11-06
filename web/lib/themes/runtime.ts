import { DEFAULT_DARK_ID, DEFAULT_LIGHT_ID, TOKEN_NAMES, TOKEN_VALUE, type ColorScheme, type ThemeDefinition, type ThemeTokens } from "./tokens";

// Applying a theme in the browser, and the cache the pre-paint script reads. Safe to import from
// client components: it doesn't pull in the catalog.

/** A saved appearance: one theme, or follow the device's light or dark setting. */
export type ThemePreference = { mode: "theme"; id: string } | { mode: "system" };

export const DEFAULT_PREFERENCE: ThemePreference = { mode: "theme", id: DEFAULT_LIGHT_ID };
export const SYSTEM_THEMES = { light: DEFAULT_LIGHT_ID, dark: DEFAULT_DARK_ID } as const;

/** What the pre-paint script applies: resolved tokens, so it needs no catalog. */
export interface AppliedTheme {
  v: 1;
  /** "guest", or a short hash of the account's login, so another account's theme isn't kept. */
  owner: string;
  preference: ThemePreference;
  /** Set for a single theme. */
  theme?: { scheme: ColorScheme; vars: Partial<ThemeTokens> };
  /** Set for System. */
  light?: { scheme: ColorScheme; vars: Partial<ThemeTokens> };
  dark?: { scheme: ColorScheme; vars: Partial<ThemeTokens> };
}

export const APPLIED_KEY = "cb-theme";
export const GUEST_PREFERENCE_KEY = "cb-theme-guest";
export const GUEST_FAVORITES_KEY = "cb-theme-favorites";
export const THEME_EVENT = "codebases:theme";

const TOKEN_SET = new Set<string>(TOKEN_NAMES);

/** Only known tokens with a strictly shaped value: nothing else from storage reaches the page. */
export function safeVars(vars: Record<string, unknown>): Partial<ThemeTokens> {
  const safe: Partial<ThemeTokens> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (TOKEN_SET.has(key) && typeof value === "string" && TOKEN_VALUE.test(value)) {
      safe[key as keyof ThemeTokens] = value;
    }
  }
  return safe;
}

export function parsePreference(value: unknown): ThemePreference | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.mode === "system") return { mode: "system" };
  if (record.mode === "theme" && typeof record.id === "string" && /^[a-z0-9-]{1,40}$/.test(record.id)) {
    return { mode: "theme", id: record.id };
  }
  return null;
}

/** A short, stable, non-reversible tag for an account's login. */
export function ownerTag(login: string): string {
  let hash = 2166136261;
  for (const char of login) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619) >>> 0;
  return `a${hash.toString(36)}`;
}

function systemIsDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

/** Sets the theme's tokens on <html>. Removing every token first returns to the CSS default. */
export function applyTokens(theme: { scheme: ColorScheme; vars: Partial<ThemeTokens> } | null): void {
  const root = document.documentElement;
  for (const token of TOKEN_NAMES) root.style.removeProperty(`--${token}`);
  const scheme = theme?.scheme ?? "light";
  if (theme) {
    for (const [token, value] of Object.entries(safeVars(theme.vars))) root.style.setProperty(`--${token}`, value);
  }
  root.style.colorScheme = scheme;
  root.dataset.scheme = scheme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme?.vars.bg ?? "#ffffff");
  window.dispatchEvent(new CustomEvent(THEME_EVENT));
}

export function toApplied(definition: ThemeDefinition): { scheme: ColorScheme; vars: Partial<ThemeTokens> } {
  return { scheme: definition.scheme, vars: { ...definition.tokens } };
}

/** The tokens a cached entry means right now (System follows the device). */
export function resolveApplied(entry: AppliedTheme): { scheme: ColorScheme; vars: Partial<ThemeTokens> } | null {
  if (entry.preference.mode === "system") return (systemIsDark() ? entry.dark : entry.light) ?? null;
  return entry.theme ?? null;
}

export function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the theme still applies for this page view.
  }
}
