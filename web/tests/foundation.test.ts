import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// LF endings, so the checks below also hold on a Windows checkout with CRLF.
const css = readFileSync(path.join(__dirname, "../app/globals.css"), "utf8").replace(/\r\n/g, "\n");

describe("craft foundation", () => {
  it.each([
    "--tracking-title",
    "--tracking-heading",
    "--tracking-label",
    "--measure-prose: 68ch",
    "--measure-lede: 60ch",
    "--hit-min: 44px",
    "--press-scale: 0.96",
    "--press-in: 90ms",
    "--press-out: 420ms",
    "--spring-release:",
    ".press-soft",
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

  it("springs back with a transition, so a canceled press returns from where it got to", () => {
    // The spring is a timing function on the release, never a keyframe animation on the button.
    expect(css).toMatch(/@supports \(transition-timing-function: linear\(0, 1\)\) \{\s*:root \{\s*--spring-release: linear\(/);
    expect(css).toMatch(/transform var\(--press-time\) var\(--press-ease\)/);
    const active = css.match(/\.btn:active:not\(:disabled\):not\(\[aria-disabled="true"\]\) \{[^}]*--press-time: var\(--press-in\)[^}]*\}/);
    expect(active, "the press itself uses the short timing").not.toBeNull();
    for (const rule of css.matchAll(/\n\.btn[^\n{]*\{([^}]*)\}/g)) expect(rule[1]).not.toMatch(/\banimation:/);
    // The overshoot is a single peak above 1 that ends at 1.
    const stops = (css.match(/--spring-release: linear\(([^)]*)\)/)?.[1] ?? "").split(",").map((stop) => Number.parseFloat(stop));
    expect(Math.max(...stops)).toBeGreaterThan(1.3);
    expect(stops.at(-1)).toBe(1);
  });

  it("turns the press transform and the stagger off under reduced motion", () => {
    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toContain("transform: none");
    expect(reduced).toContain("animation: none");
    expect(reduced).toContain("::view-transition-group(*)");
  });
});
