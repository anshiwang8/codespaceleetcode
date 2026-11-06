import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { THEMES } from "@/lib/themes/catalog.generated";
import { PREPAINT_SCRIPT } from "@/lib/themes/prepaint";
import { APPLIED_KEY, ownerTag, parsePreference, safeVars, toApplied } from "@/lib/themes/runtime";

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
const nocturne = THEMES.find((theme) => theme.id === "dracula");

describe("pre-paint script", () => {
  it("applies a cached theme's tokens and color scheme", () => {
    if (!nocturne) throw new Error("missing theme");
    const entry = { v: 1, owner: "guest", preference: { mode: "theme", id: "dracula" }, theme: toApplied(nocturne) };
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

  it("does nothing without a cache, or with a broken one", () => {
    for (const stored of [null, "", "not json", "{}", '{"v":2}', "[]", "null"]) {
      expect(prepaint(stored).properties.size, String(stored)).toBe(0);
    }
  });

  it("applies only custom properties with a hex or rgb() value, so a tampered cache can't inject CSS", () => {
    const entry = {
      v: 1,
      owner: "guest",
      preference: { mode: "theme", id: "x" },
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
    expect(parsePreference({ mode: "theme", id: "dracula" })).toEqual({ mode: "theme", id: "dracula" });
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
