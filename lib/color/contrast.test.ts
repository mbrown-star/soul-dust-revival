import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, relativeLuminance } from "./contrast";

describe("hexToRgb", () => {
  it("parses a valid hex color", () => {
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(hexToRgb("000000")).toEqual([0, 0, 0]);
  });

  it("returns null for an invalid or incomplete hex value", () => {
    expect(hexToRgb("#fff")).toBeNull();
    expect(hexToRgb("not-a-color")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });

  it("returns null for an invalid hex value", () => {
    expect(relativeLuminance("nope")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white (the maximum possible)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("is 1:1 for a color against itself", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#1a120c", "#fef3c7");
    const b = contrastRatio("#fef3c7", "#1a120c");
    expect(a).toBeCloseTo(b as number, 10);
  });

  it("returns null if either color is invalid", () => {
    expect(contrastRatio("#ffffff", "bogus")).toBeNull();
    expect(contrastRatio("bogus", "#ffffff")).toBeNull();
  });

  it("confirms the callout color picker's own default swatch passes WCAG AA", () => {
    // #fef3c7 is ColorPicker.tsx's fallback background; ink (#1a120c) is the
    // callout title's real rendered color (LessonBlock.tsx) -- this should
    // never start failing without someone noticing via the picker's own
    // live warning, but it's worth pinning as a regression check too.
    expect(contrastRatio("#fef3c7", "#1a120c")).toBeGreaterThanOrEqual(4.5);
  });
});
