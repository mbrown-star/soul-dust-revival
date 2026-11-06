/**
 * pdfjs-dist (used internally by pdf-parse) tries to polyfill `DOMMatrix` /
 * `ImageData` / `Path2D` from the optional `@napi-rs/canvas` native addon
 * when they aren't already global -- but `@napi-rs/canvas` is a native
 * binary, not WASM, and can't load at all in Cloudflare Workers. When it
 * fails to load, pdfjs-dist's own fallback never runs, and a bare
 * `DOMMatrix` reference elsewhere in its text-layer code throws
 * `ReferenceError: DOMMatrix is not defined` before any text extraction
 * happens -- confirmed live via `wrangler tail` against a real study
 * import failing in production.
 *
 * Supplying a minimal, 2D-only `DOMMatrix` here satisfies pdfjs-dist's own
 * `if (!globalThis.DOMMatrix)` self-check, so its real (canvas-backed)
 * polyfill attempt is skipped entirely -- no need to patch pdfjs-dist
 * itself. `ImageData`/`Path2D` are polyfilled the same way, as inert stubs:
 * plain text extraction (`getText()`) never actually calls a method on
 * either, they just need to exist so a bare reference to the constructor
 * doesn't throw.
 *
 * Guarded to only install where these are genuinely missing. Local dev and
 * `vitest` (both plain Node, where `@napi-rs/canvas` loads normally) are
 * untouched -- this only ever engages in the Workers runtime.
 *
 * Separately, pdfjs-dist also needs an actual text-extraction engine to run
 * -- normally a real Worker thread, falling back to a same-thread "fake
 * worker" that dynamically `import()`s its own `pdf.worker.mjs` file when a
 * real Worker isn't available or usable. That dynamic import of a
 * standalone worker script (not part of this app's own module graph) fails
 * in the Workers runtime ("Setting up fake worker failed: 'No such module
 * \"pdf.worker.mjs\"'", confirmed live via `wrangler tail`) -- Workers'
 * module resolution has no notion of a loose file sitting next to a
 * dynamically-loaded external package the way Node's filesystem-based
 * `import()` does. pdfjs-dist checks `globalThis.pdfjsWorker
 * .WorkerMessageHandler` *before* attempting that dynamic import, so
 * statically importing the worker module ourselves and registering it
 * there short-circuits the whole broken code path.
 */
export async function ensurePdfTextExtractionGlobals(): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>;

  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = MinimalDOMMatrix;
  }

  if (!g.pdfjsWorker) {
    const { WorkerMessageHandler } = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    g.pdfjsWorker = { WorkerMessageHandler };
  }

  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
        if (dataOrWidth instanceof Uint8ClampedArray) {
          this.data = dataOrWidth;
          this.width = widthOrHeight;
          this.height = height ?? 0;
        } else {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        }
      }
    };
  }

  if (typeof g.Path2D === "undefined") {
    // No method is ever called on this by plain text extraction -- it only
    // needs to exist as a constructor.
    g.Path2D = class Path2DPolyfill {};
  }
}

type MatrixLike = { a: number; b: number; c: number; d: number; e: number; f: number };

/**
 * A standard 2D affine transform (the only kind pdfjs-dist's text-layer
 * positioning math needs) -- the same six-value a/b/c/d/e/f model the real
 * DOMMatrix uses, with just the operations pdfjs-dist actually calls:
 * construct from an identity, a 6-value array, or another matrix; multiply
 * (and its alias, transform); translate; scale; invertSelf; transformPoint.
 */
export class MinimalDOMMatrix implements MatrixLike {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | MatrixLike) {
    if (Array.isArray(init)) {
      if (init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init as [number, number, number, number, number, number];
      }
    } else if (init && typeof init === "object") {
      this.a = init.a;
      this.b = init.b;
      this.c = init.c;
      this.d = init.d;
      this.e = init.e;
      this.f = init.f;
    }
  }

  get is2D(): boolean {
    return true;
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  // DOMMatrix semantics: `this.multiply(other)` applies `other` first, then
  // `this` -- i.e. the result transforms a point as this.transformPoint(other.transformPoint(p)).
  multiply(other: MatrixLike): MinimalDOMMatrix {
    return new MinimalDOMMatrix([
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    ]);
  }

  transform(other: MatrixLike): MinimalDOMMatrix {
    return this.multiply(other);
  }

  translate(tx = 0, ty = 0): MinimalDOMMatrix {
    return this.multiply({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  scale(sx = 1, sy = sx): MinimalDOMMatrix {
    return this.multiply({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      this.a = this.b = this.c = this.d = this.e = this.f = NaN;
      return this;
    }
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const e = -(a * this.e + c * this.f);
    const f = -(b * this.e + d * this.f);
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  transformPoint(point: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.a * point.x + this.c * point.y + this.e,
      y: this.b * point.x + this.d * point.y + this.f,
    };
  }
}
