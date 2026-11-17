import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { THEMES } from "@/lib/themes/catalog.generated";
import { PREPAINT_SCRIPT } from "@/lib/themes/prepaint";
import { APPLIED_KEY, GUEST_FAVORITES_KEY, GUEST_PREFERENCE_KEY, ownerTag, parsePreference, safeVars, toApplied } from "@/lib/themes/runtime";
import { KNOWN_THEME_IDS } from "@/lib/themes/tokens";

/** Runs the pre-paint script against a stub page, returning what it set on <html>. */
function prepaint(stored: string | null, systemDark = false) {
  const properties = new Map<string, string>();
  const attributes = new Map<string, string>();
  const root = {
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      colorScheme: "",
    },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  runInNewContext(PREPAINT_SCRIPT, {
    document: { documentElement: root },
    localStorage: { getItem: (key: string) => (key === APPLIED_KEY ? stored : null) },
    matchMedia: () => ({ matches: systemDark }),
  });
  return { properties, attributes, colorScheme: root.style.colorScheme };
}

const dark = THEMES.find((theme) => theme.id === "default-dark");
const nocturne = THEMES.find((theme) => theme.id === "ink");

/** Saved IDs that aren't themes: three from the earlier catalog, and ones that never were. */
const UNKNOWN_IDS = ["dracula", "nord", "menthol", "no-such-theme", "x"];

describe("pre-paint script", () => {
  it("applies a cached theme's tokens and color scheme", () => {
    if (!nocturne) throw new Error("missing theme");
    const entry = { v: 1, owner: "guest", preference: { mode: "theme", id: "ink" }, theme: toApplied(nocturne) };
    const result = prepaint(JSON.stringify(entry));
    expect(result.properties.get("--bg")).toBe(nocturne.tokens.bg);
    expect(result.properties.get("--accent")).toBe(nocturne.tokens.accent);
    expect(result.properties.size).toBe(Object.keys(nocturne.tokens).length);
    expect(result.colorScheme).toBe("dark");
    expect(result.attributes.get("data-scheme")).toBe("dark");
  });

  it("follows the device for System", () => {
    if (!dark || !nocturne) throw new Error("missing theme");
    const entry = { v: 1, owner: "guest", preference: { mode: "system" }, light: toApplied(THEMES[0] ?? dark), dark: toApplied(dark) };
    expect(prepaint(JSON.stringify(entry), true).properties.get("--bg")).toBe(dark.tokens.bg);
    expect(prepaint(JSON.stringify(entry), false).properties.get("--bg")).toBe(THEMES[0]?.tokens.bg);
  });

  it("paints every known theme from its cache", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual([...KNOWN_THEME_IDS]);
    for (const theme of THEMES) {
      const entry = { v: 1, owner: "guest", preference: { mode: "theme", id: theme.id }, theme: toApplied(theme) };
      const result = prepaint(JSON.stringify(entry));
      expect(result.properties.get("--bg"), theme.id).toBe(theme.tokens.bg);
      expect(result.colorScheme, theme.id).toBe(theme.scheme);
    }
  });

  it("doesn't paint a cached theme whose ID isn't known, so the default shows with no flash", () => {
    if (!nocturne) throw new Error("missing theme");
    for (const id of [...UNKNOWN_IDS, "", 7, null, undefined, ["ink"]]) {
      // What a browser cached while the theme still existed: its ID and its resolved tokens.
      const entry = { v: 1, owner: "guest", preference: { mode: "theme", id }, theme: toApplied(nocturne) };
      const result = prepaint(JSON.stringify(entry));
      expect(result.properties.size, String(id)).toBe(0);
      expect(result.attributes.size, String(id)).toBe(0);
      expect(result.colorScheme, String(id)).toBe("");
    }
  });

  it("carries only the eight IDs, not the catalog", () => {
    expect(PREPAINT_SCRIPT).toContain(JSON.stringify(KNOWN_THEME_IDS));
    expect(PREPAINT_SCRIPT.length).toBeLessThan(1200);
    for (const theme of THEMES) expect(PREPAINT_SCRIPT).not.toContain(theme.tokens.text);
  });

  it("does nothing without a cache, or with a broken one", () => {
    for (const stored of [null, "", "not json", "{}", '{"v":2}', "[]", "null"]) {
      expect(prepaint(stored).properties.size, String(stored)).toBe(0);
    }
  });

  it("applies only custom properties with a hex or rgb() value, so a tampered cache can't inject CSS", () => {
    const entry = {
      v: 1,
      owner: "guest",
      preference: { mode: "theme", id: "cream" },
      theme: {
        scheme: "dark",
        vars: {
          bg: "#101010",
          text: "red; background: url(https://evil.example/x)",
          accent: "url(javascript:alert(1))",
          "line; color": "#ffffff",
          panel: "expression(alert(1))",
          "accent-soft": "rgb(10 20 30 / 40%)",
          focus: "#fff",
        },
      },
    };
    const result = prepaint(JSON.stringify(entry));
    expect([...result.properties.entries()]).toEqual([
      ["--bg", "#101010"],
      ["--accent-soft", "rgb(10 20 30 / 40%)"],
    ]);
  });
});

describe("runtime helpers", () => {
  it("keeps only known tokens with safe values", () => {
    expect(safeVars({ bg: "#000000", nope: "#ffffff", text: "red", accent: "rgb(1 2 3 / 50%)" })).toEqual({
      bg: "#000000",
      accent: "rgb(1 2 3 / 50%)",
    });
  });

  it("reads preferences strictly", () => {
    expect(parsePreference({ mode: "system" })).toEqual({ mode: "system" });
    expect(parsePreference({ mode: "theme", id: "mint-mist" })).toEqual({ mode: "theme", id: "mint-mist" });
    for (const bad of [null, "dark", { mode: "theme" }, { mode: "theme", id: "Bad Id" }, { mode: "auto" }, { mode: "theme", id: "a".repeat(41) }]) {
      expect(parsePreference(bad)).toBeNull();
    }
  });

  it("tags an account without storing its login", () => {
    const tag = ownerTag("octocat");
    expect(tag).toBe(ownerTag("octocat"));
    expect(tag).not.toBe(ownerTag("octocat2"));
    expect(tag).not.toContain("octocat");
  });
});

/** A stub browser for the controller: storage, the root element's inline properties, no media query. */
function browser(stored: Record<string, unknown>) {
  const storage = new Map(Object.entries(stored).map(([key, value]) => [key, JSON.stringify(value)]));
  const properties = new Map<string, string>();
  const root = {
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => properties.delete(name),
      colorScheme: "",
    },
    dataset: {} as Record<string, string>,
  };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
    dispatchEvent: () => true,
  });
  vi.stubGlobal("document", { documentElement: root, querySelector: () => null });
  return { storage, properties, root };
}

/** A fresh controller, counting how often it loads the catalog. */
async function controller() {
  vi.resetModules();
  const loads = { count: 0 };
  vi.doMock("@/lib/themes/catalog.generated", () => {
    loads.count++;
    return { THEMES };
  });
  return { ...(await import("@/lib/themes/controller")), loads };
}

describe.each(UNKNOWN_IDS)("controller, with the saved theme %s, which isn't in the catalog", (unknown) => {
  const stale = () => {
    if (!nocturne) throw new Error("missing theme");
    return { v: 1, owner: "guest", preference: { mode: "theme", id: unknown }, theme: toApplied(nocturne) };
  };

  afterEach(() => {
    vi.doUnmock("@/lib/themes/catalog.generated");
    vi.unstubAllGlobals();
  });

  it("falls back to the default for a guest, forgets the choice, the cache and old favorites, and never loads the catalog", async () => {
    const page = browser({
      [GUEST_PREFERENCE_KEY]: { mode: "theme", id: unknown },
      [GUEST_FAVORITES_KEY]: [unknown, "nord"],
      [APPLIED_KEY]: stale(),
    });
    const { adoptGuest, getState, loads } = await controller();
    adoptGuest();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getState()).toEqual({ committed: { mode: "theme", id: "default-light" }, previewing: null, scope: "guest" });
    expect(page.properties.size).toBe(0);
    expect(page.root.dataset.scheme).toBe("light");
    expect(page.storage.has(APPLIED_KEY)).toBe(false);
    expect(page.storage.has(GUEST_PREFERENCE_KEY)).toBe(false);
    expect(page.storage.has(GUEST_FAVORITES_KEY)).toBe(false);
    expect(loads.count).toBe(0);
  });

  it("falls back to the default for an account, whatever this browser cached or the server sent", async () => {
    const page = browser({ [APPLIED_KEY]: { ...stale(), owner: ownerTag("octocat") } });
    const { adoptAccount, getState, loads } = await controller();
    // The shape /api/me sends, with favorites an older server might still list.
    const sent = { preference: { mode: "theme" as const, id: unknown }, favorites: [unknown, "nord"] };
    adoptAccount("octocat", sent);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getState()).toEqual({ committed: { mode: "theme", id: "default-light" }, previewing: null, scope: "account" });
    expect(page.properties.size).toBe(0);
    expect(page.storage.has(APPLIED_KEY)).toBe(false);
    expect(loads.count).toBe(0);
  });

  it("shows the default when it's previewed or applied anyway", async () => {
    const page = browser({});
    const { adoptGuest, commit, getState, loads } = await controller();
    adoptGuest();
    await commit({ mode: "theme", id: unknown });
    expect(getState().committed).toEqual({ mode: "theme", id: "default-light" });
    expect(page.properties.size).toBe(0);
    expect(page.storage.has(APPLIED_KEY)).toBe(false);
    expect(page.storage.has(GUEST_PREFERENCE_KEY)).toBe(false);
    expect(loads.count).toBe(0);
  });
});

describe("controller, with a theme that exists", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/themes/catalog.generated");
    vi.unstubAllGlobals();
  });

  it("never loads the catalog for the default theme", async () => {
    const page = browser({});
    const { adoptGuest, adoptAccount, loads } = await controller();
    adoptGuest();
    adoptAccount("octocat", { preference: null });
    adoptAccount("octocat", { preference: { mode: "theme", id: "default-light" } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.properties.size).toBe(0);
    expect(loads.count).toBe(0);
  });

  it.each(["cream", "periwinkle-mist", "mint-mist", "ink", "dusk", "pine", "default-dark"])("applies %s and caches it for the pre-paint script", async (id) => {
    const theme = THEMES.find((entry) => entry.id === id);
    if (!theme) throw new Error("missing theme");
    const page = browser({ [GUEST_PREFERENCE_KEY]: { mode: "theme", id } });
    const { adoptGuest, getState, loads } = await controller();
    adoptGuest();
    await vi.waitFor(() => expect(page.properties.get("--bg")).toBe(theme.tokens.bg));
    expect(getState().committed).toEqual({ mode: "theme", id });
    expect(loads.count).toBe(1);
    const cache = page.storage.get(APPLIED_KEY) ?? "null";
    expect(JSON.parse(cache)).toMatchObject({ preference: { mode: "theme", id } });
    // And the pre-paint script paints that cache.
    expect(prepaint(cache).properties.get("--bg")).toBe(theme.tokens.bg);
  });
});
