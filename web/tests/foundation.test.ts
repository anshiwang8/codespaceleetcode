import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8");

describe("craft foundation", () => {
  it.each([
    "--tracking-title",
    "--tracking-heading",
    "--tracking-label",
    "--measure-prose: 68ch",
    "--measure-lede: 60ch",
    "--hit-min: 44px",
    "--press-scale: 0.97",
    "--plate:",
    "--mascot-body:",
    "--mascot-ink:",
    "--mascot-edge:",
    ".btn-forward",
    ".hit-area::after",
    ".stagger-in",
    ".plate",
    "::view-transition-group(.morph)",
    "env(safe-area-inset-left",
  ])("defines %s", (needle) => {
    expect(css).toContain(needle);
  });

  it("never transitions every property", () => {
    expect(css).not.toMatch(/transition:\s*all\b/);
  });

  it("keeps every button hover style behind a fine pointer", () => {
    const gated = "@media (hover: hover) and (pointer: fine) {\n";
    const hovers = [...css.matchAll(/\n((?:a)?\.btn[^\n{]*:hover[^{]*)\{/g)];
    expect(hovers.length).toBeGreaterThan(5);
    for (const match of hovers) {
      const before = css.slice(0, (match.index ?? 0) + 1);
      expect(before.endsWith(gated), match[1]).toBe(true);
    }
  });

  it("turns the press transform and the stagger off under reduced motion", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("transform: none");
    expect(reduced).toContain("animation: none");
    expect(reduced).toContain("::view-transition-group(*)");
  });
});
