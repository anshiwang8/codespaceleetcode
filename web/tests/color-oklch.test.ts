import { describe, expect, it } from "vitest";
import { contrast, ensureContrast, fromOklch, mixOklch, toOklch } from "@/lib/themes/color";

describe("OKLCH color math", () => {
  it("matches known OKLCH values", () => {
    // Reference values from CSS Color 4's conversion (oklch.com).
    const white = toOklch("#ffffff");
    expect(white.l).toBeCloseTo(1, 3);
    expect(white.c).toBeLessThan(1e-3);
    const blue = toOklch("#2563eb");
    expect(blue.l).toBeCloseTo(0.546, 2);
    expect(blue.c).toBeCloseTo(0.215, 2);
    expect(blue.h).toBeCloseTo(262.9, 0);
  });

  it("round-trips sRGB colors", () => {
    for (const hex of ["#000000", "#ffffff", "#2563eb", "#b91c1c", "#15803d", "#b45309", "#0f141b", "#e6edf3"]) {
      expect(fromOklch(toOklch(hex))).toBe(hex);
    }
  });

  it("gamut-maps by lowering chroma, keeping lightness and hue", () => {
    const out = toOklch(fromOklch({ l: 0.7, c: 0.4, h: 145 }));
    expect(out.l).toBeCloseTo(0.7, 2);
    expect(out.h).toBeCloseTo(145, -1);
    expect(out.c).toBeLessThan(0.4);
  });

  it("mixes perceptually: halfway from black to white is mid lightness", () => {
    expect(toOklch(mixOklch("#000000", "#ffffff", 0.5)).l).toBeCloseTo(0.5, 2);
    expect(mixOklch("#2563eb", "#2563eb", 0.4)).toBe("#2563eb");
  });

  it("reaches a contrast target while keeping the hue", () => {
    const moved = ensureContrast("#6b8cff", ["#ffffff"], 4.5);
    expect(contrast(moved, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(Math.abs(toOklch(moved).h - toOklch("#6b8cff").h)).toBeLessThan(3);
  });
});
