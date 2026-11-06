import { describe, expect, it } from "vitest";
import { ensurePdfTextExtractionGlobals, MinimalDOMMatrix } from "./pdfTextExtractionGlobals";

describe("ensurePdfTextExtractionGlobals", () => {
  it("installs DOMMatrix, ImageData, and Path2D when missing", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const originals = { DOMMatrix: g.DOMMatrix, ImageData: g.ImageData, Path2D: g.Path2D };
    delete g.DOMMatrix;
    delete g.ImageData;
    delete g.Path2D;

    try {
      ensurePdfTextExtractionGlobals();
      expect(typeof g.DOMMatrix).toBe("function");
      expect(typeof g.ImageData).toBe("function");
      expect(typeof g.Path2D).toBe("function");
    } finally {
      g.DOMMatrix = originals.DOMMatrix;
      g.ImageData = originals.ImageData;
      g.Path2D = originals.Path2D;
    }
  });

  it("does not overwrite an existing global", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const sentinel = function FakeDOMMatrix() {};
    const original = g.DOMMatrix;
    g.DOMMatrix = sentinel;

    try {
      ensurePdfTextExtractionGlobals();
      expect(g.DOMMatrix).toBe(sentinel);
    } finally {
      g.DOMMatrix = original;
    }
  });
});

describe("MinimalDOMMatrix", () => {
  it("defaults to the identity matrix", () => {
    const m = new MinimalDOMMatrix();
    expect(m.isIdentity).toBe(true);
    expect(m.transformPoint({ x: 5, y: 7 })).toEqual({ x: 5, y: 7 });
  });

  it("constructs from a 6-value array in a/b/c/d/e/f order", () => {
    const m = new MinimalDOMMatrix([1, 0, 0, 1, 10, 20]);
    expect(m.transformPoint({ x: 0, y: 0 })).toEqual({ x: 10, y: 20 });
  });

  it("translate() moves a point by the given offset", () => {
    const m = new MinimalDOMMatrix().translate(3, 4);
    expect(m.transformPoint({ x: 1, y: 1 })).toEqual({ x: 4, y: 5 });
  });

  it("scale() scales a point around the origin", () => {
    const m = new MinimalDOMMatrix().scale(2, 3);
    expect(m.transformPoint({ x: 1, y: 1 })).toEqual({ x: 2, y: 3 });
  });

  it("multiply() applies the other matrix first, then this one", () => {
    // translate by (10, 0) then scale by 2 -- a point at the origin should
    // land at (20, 0): scaled AFTER the translate, matching DOMMatrix's own
    // "this.multiply(other)" semantics (other applied first).
    const scale = new MinimalDOMMatrix().scale(2, 2);
    const translate = new MinimalDOMMatrix().translate(10, 0);
    const combined = scale.multiply(translate);
    expect(combined.transformPoint({ x: 0, y: 0 })).toEqual({ x: 20, y: 0 });
  });

  it("invertSelf() undoes a translation", () => {
    const m = new MinimalDOMMatrix().translate(5, -3).invertSelf();
    expect(m.transformPoint({ x: 5, y: -3 })).toEqual({ x: 0, y: 0 });
  });
});
