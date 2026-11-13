import { DEFAULT_LIGHT_ID, type ThemeDefinition } from "./tokens";
import {
  APPLIED_KEY,
  applyTokens,
  DEFAULT_PREFERENCE,
  GUEST_FAVORITES_KEY,
  GUEST_PREFERENCE_KEY,
  ownerTag,
  parsePreference,
  readJson,
  resolveApplied,
  SYSTEM_THEMES,
  toApplied,
  writeJson,
  type AppliedTheme,
  type ThemePreference,
} from "./runtime";

// The browser's appearance state: what's saved, what's being previewed, and favorites.
//
// Precedence: a signed-in account's saved theme wins. Without one, the browser's guest choice
// applies. Without either, codebases Light. "System" is a saved choice like any theme, and
// follows the device between codebases Light and codebases Dark.
//
// Signed in, choices are saved to the account (PUT /api/me/preferences) and the guest choice in
// this browser is left alone, so signing out returns to it. The cache the pre-paint script reads
// is tagged with its owner; when another person (or nobody) is signed in, it's replaced.

export interface AppearanceState {
  committed: ThemePreference;
  favorites: string[];
  /** Set while a theme is being previewed and not yet applied. */
  previewing: ThemePreference | null;
  /** Whose choice this is. */
  scope: "guest" | "account";
}

export interface AccountAppearance {
  preference: ThemePreference | null;
  favorites: string[];
}

type Listener = () => void;

let state: AppearanceState = { committed: DEFAULT_PREFERENCE, favorites: [], previewing: null, scope: "guest" };
let owner = "guest";
const listeners = new Set<Listener>();
let catalog: Promise<readonly ThemeDefinition[]> | null = null;
let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

function set(next: Partial<AppearanceState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): AppearanceState {
  return state;
}

/** The full catalog, loaded on first use: it's only needed to change or resolve a theme. */
export function loadCatalog(): Promise<readonly ThemeDefinition[]> {
  if (!catalog) {
    const loading = import("./catalog.generated").then((module) => module.THEMES);
    catalog = loading;
    // A failed fetch (offline for a moment, say) isn't kept, so the next ask tries again.
    loading.catch(() => {
      if (catalog === loading) catalog = null;
    });
  }
  return catalog;
}

async function resolve(preference: ThemePreference): Promise<AppliedTheme> {
  const themes = await loadCatalog();
  const find = (id: string) => themes.find((theme) => theme.id === id) ?? themes.find((theme) => theme.id === DEFAULT_LIGHT_ID);
  if (preference.mode === "system") {
    const light = find(SYSTEM_THEMES.light);
    const dark = find(SYSTEM_THEMES.dark);
    return {
      v: 1,
      owner,
      preference,
      ...(light ? { light: toApplied(light) } : {}),
      ...(dark ? { dark: toApplied(dark) } : {}),
    };
  }
  const theme = find(preference.id);
  return { v: 1, owner, preference: theme ? { mode: "theme", id: theme.id } : DEFAULT_PREFERENCE, ...(theme ? { theme: toApplied(theme) } : {}) };
}

function watchSystem(entry: AppliedTheme): void {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!media) return;
  if (mediaListener) media.removeEventListener("change", mediaListener);
  mediaListener = null;
  if (entry.preference.mode !== "system") return;
  mediaListener = () => applyTokens(resolveApplied(entry));
  media.addEventListener("change", mediaListener);
}

function cached(): AppliedTheme | null {
  const entry = readJson(APPLIED_KEY) as AppliedTheme | null;
  return entry && entry.v === 1 && parsePreference(entry.preference) ? entry : null;
}

const same = (a: ThemePreference, b: ThemePreference) =>
  a.mode === b.mode && (a.mode === "system" || (b.mode === "theme" && a.id === b.id));

/** Applies a preference and makes it what the pre-paint script uses next time. */
async function show(preference: ThemePreference, remember: boolean): Promise<void> {
  const entry = await resolve(preference);
  applyTokens(resolveApplied(entry));
  if (remember) {
    // The default needs no cache: the CSS already is the default.
    writeJson(APPLIED_KEY, same(entry.preference, DEFAULT_PREFERENCE) && owner === "guest" ? null : entry);
    watchSystem(entry);
  }
}

function guestPreference(): ThemePreference {
  return parsePreference(readJson(GUEST_PREFERENCE_KEY)) ?? DEFAULT_PREFERENCE;
}

function guestFavorites(): string[] {
  const value = readJson(GUEST_FAVORITES_KEY);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
}

/** Nobody is signed in: this browser's own choice applies. */
export function adoptGuest(): void {
  owner = "guest";
  const committed = guestPreference();
  set({ committed, favorites: guestFavorites(), previewing: null, scope: "guest" });
  const entry = cached();
  if (!entry || entry.owner !== "guest" || !same(entry.preference, committed)) void show(committed, true);
  else watchSystem(entry);
}

/** Someone is signed in: their saved choice applies, or this browser's when they have none. */
export function adoptAccount(login: string, appearance: AccountAppearance | null): void {
  owner = ownerTag(login);
  const committed = appearance?.preference ?? guestPreference();
  set({ committed, favorites: appearance?.favorites ?? [], previewing: null, scope: "account" });
  const entry = cached();
  if (!entry || entry.owner !== owner || !same(entry.preference, committed)) void show(committed, true);
  else watchSystem(entry);
}

/** Shows a theme without saving it. cancelPreview() or commit() ends it. */
export async function preview(preference: ThemePreference): Promise<void> {
  set({ previewing: preference });
  const entry = await resolve(preference);
  // A later preview, a cancel or a commit may have happened while the catalog loaded.
  if (state.previewing && same(state.previewing, preference)) applyTokens(resolveApplied(entry));
}

/** Back to the saved theme. */
export async function cancelPreview(): Promise<void> {
  if (!state.previewing) return;
  set({ previewing: null });
  const entry = cached();
  if (entry && entry.owner === owner && same(entry.preference, state.committed)) applyTokens(resolveApplied(entry));
  else await show(state.committed, true);
}

async function saveToAccount(body: { preference?: ThemePreference; favorites?: string[] }): Promise<void> {
  const response = await fetch("/api/me/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(response.status === 401 ? "You've been signed out." : "Couldn't save your theme.");
}

/**
 * Saves and applies a theme. Signed in, it's saved to the account first; if that fails the
 * previous theme comes back and the error is thrown for the caller to show.
 */
export async function commit(preference: ThemePreference): Promise<void> {
  const previous = state.committed;
  if (state.scope === "account") {
    try {
      await saveToAccount({ preference });
    } catch (error) {
      set({ previewing: null });
      await show(previous, true);
      throw error;
    }
  } else {
    writeJson(GUEST_PREFERENCE_KEY, same(preference, DEFAULT_PREFERENCE) ? null : preference);
  }
  set({ committed: preference, previewing: null });
  await show(preference, true);
}

export async function toggleFavorite(id: string): Promise<void> {
  const previous = state.favorites;
  const favorites = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id].slice(0, 200);
  set({ favorites });
  try {
    if (state.scope === "account") await saveToAccount({ favorites });
    else writeJson(GUEST_FAVORITES_KEY, favorites.length > 0 ? favorites : null);
  } catch (error) {
    set({ favorites: previous });
    throw error;
  }
}
