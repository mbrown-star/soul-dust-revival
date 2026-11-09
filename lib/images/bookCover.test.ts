import { describe, expect, it } from "vitest";
import { PhotonImage } from "@cf-wasm/photon";
import { CoverTooLargeError, NoCoverImageFoundError, splitBookCoverPdf } from "./bookCover";

/**
 * Builds a minimal, valid single-page PDF with one embedded, uncompressed
 * raw-RGB image XObject -- just enough for a real pdf.js/unpdf parse, no
 * fixture library needed. Lets this test exercise the real unpdf +
 * @cf-wasm/photon pipeline end-to-end instead of mocking it.
 *
 * `page` lets a test declare a MediaBox independent of the embedded image's
 * own pixel size (e.g. to test the oversized-page guard cheaply, without
 * actually having to allocate a huge raw image buffer in the test itself).
 */
function buildTestCoverPdf(
  width: number,
  height: number,
  rgbBytes: Uint8Array,
  page: { width: number; height: number } = { width, height }
): Uint8Array {
  const enc = new TextEncoder();
  const objects: Uint8Array[] = [];

  objects.push(enc.encode(`<< /Type /Catalog /Pages 2 0 R >>`));
  objects.push(enc.encode(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`));
  objects.push(
    enc.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
    )
  );

  const imgDictStr = `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${rgbBytes.length} >>`;
  objects.push(concatBytes([enc.encode(imgDictStr + "\nstream\n"), rgbBytes, enc.encode("\nendstream")]));

  const contentStream = `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q`;
  objects.push(enc.encode(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`));

  const header = enc.encode("%PDF-1.4\n");
  const parts: Uint8Array[] = [header];
  const offsets: number[] = [];
  let pos = header.length;

  objects.forEach((bytes, i) => {
    offsets.push(pos);
    const objHeader = enc.encode(`${i + 1} 0 obj\n`);
    const objFooter = enc.encode(`\nendobj\n`);
    parts.push(objHeader, bytes, objFooter);
    pos += objHeader.length + bytes.length + objFooter.length;
  });

  const xrefStart = pos;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += String(offset).padStart(10, "0") + " 00000 n \n";
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(enc.encode(xref), enc.encode(trailer));

  return concatBytes(parts);
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function solidColorRgb(width: number, height: number, leftColor: [number, number, number], rightColor: [number, number, number]) {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const [r, g, b] = x < width / 2 ? leftColor : rightColor;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return data;
}

function jpegHeaderOf(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

describe("splitBookCoverPdf", () => {
  it("splits a flattened full-wrap cover into distinct back/front JPEG images", async () => {
    // Left half red (back cover), right half blue (front cover).
    const rgb = solidColorRgb(4, 2, [255, 0, 0], [0, 0, 255]);
    const pdf = buildTestCoverPdf(4, 2, rgb);

    const { back, front } = await splitBookCoverPdf(pdf);

    expect(jpegHeaderOf(back)).toBe(true);
    expect(jpegHeaderOf(front)).toBe(true);
    // A real image, not an accidental swap or no-op -- the two halves must
    // actually differ once re-encoded.
    expect(back).not.toEqual(front);
  });

  it("stops each crop short of the midpoint, so the spine band isn't included in either", async () => {
    // Wide image so the 6%-of-width spine margin is more than a rounding
    // error: left quarter red (back cover), right quarter blue (front
    // cover), with a green band across the middle (the spine) that neither
    // crop should include any of.
    const width = 200;
    const height = 10;
    const rgb = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 3;
        const midpoint = width / 2;
        const inSpineBand = Math.abs(x - midpoint) < width * 0.05; // narrower than the 6% margin on each side
        const [r, g, b] = inSpineBand ? [0, 255, 0] : x < midpoint ? [255, 0, 0] : [0, 0, 255];
        rgb[i] = r;
        rgb[i + 1] = g;
        rgb[i + 2] = b;
      }
    }
    const pdf = buildTestCoverPdf(width, height, rgb);

    const { back, front } = await splitBookCoverPdf(pdf);

    const backImage = PhotonImage.new_from_byteslice(back);
    const frontImage = PhotonImage.new_from_byteslice(front);
    try {
      // Each crop should be narrower than a plain 50/50 split (100px) --
      // the spine margin was actually excluded, not a no-op.
      expect(backImage.get_width()).toBeLessThan(width / 2);
      expect(frontImage.get_width()).toBeLessThan(width / 2);

      const backPixels = backImage.get_raw_pixels();
      const frontPixels = frontImage.get_raw_pixels();
      // The rightmost column of the back crop (closest to the spine) and
      // the leftmost column of the front crop should both be pure red/blue,
      // not the green spine color re-encoded in from JPEG compression noise
      // -- checked loosely since JPEG is lossy.
      const backW = backImage.get_width();
      const lastBackPixel = [backPixels[(backW - 1) * 4], backPixels[(backW - 1) * 4 + 1], backPixels[(backW - 1) * 4 + 2]];
      const firstFrontPixel = [frontPixels[0], frontPixels[1], frontPixels[2]];
      expect(lastBackPixel[1]).toBeLessThan(80); // not green
      expect(firstFrontPixel[1]).toBeLessThan(80); // not green
    } finally {
      backImage.free();
      frontImage.free();
    }
  });

  it("falls back to a plain spine-margin split when no genuine border can be found (a tiny localized bright spot isn't mistaken for one)", async () => {
    // REGRESSION (found live 2026-11-09, reprocessing the real Colossians
    // cover): the first version of this fix measured a border by scanning a
    // single row, which can lock onto some other small bright feature near
    // one edge instead of a real border frame -- a single-row sample has no
    // way to tell a real, full-height border line from a small localized
    // bright spot. Since fixed to require a column be bright across many
    // sampled rows spread down the full height before it counts as a
    // border stroke at all (see findBorderClusters) -- a spot only a few
    // rows tall fails that bar outright, rather than needing a separate
    // plausibility guard after the fact.
    const width = 400;
    const height = 200;
    const bg: [number, number, number] = [40, 30, 20];
    const accent: [number, number, number] = [255, 230, 180];

    const rgb = new Uint8Array(width * height * 3);
    const setPixel = (x: number, y: number, [r, g, b]: [number, number, number]) => {
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) setPixel(x, y, bg);
    }
    // A tiny bright feature, only a few rows tall -- nothing resembling a
    // border line that runs the full height.
    for (let y = 95; y <= 104; y++) {
      for (let dx = -1; dx <= 1; dx++) {
        setPixel(140 + dx, y, accent);
        setPixel(260 + dx, y, accent);
      }
    }

    const pdf = buildTestCoverPdf(width, height, rgb);
    const { back, front } = await splitBookCoverPdf(pdf);

    const backImage = PhotonImage.new_from_byteslice(back);
    const frontImage = PhotonImage.new_from_byteslice(front);
    try {
      // Matches the plain spine-margin fallback exactly, not some crop
      // shaped around the false spot.
      const midpoint = Math.floor(width / 2);
      const margin = Math.round(width * 0.06);
      expect(backImage.get_width()).toBe(midpoint - margin);
      expect(frontImage.get_width()).toBe(width - (midpoint + margin));
    } finally {
      backImage.free();
      frontImage.free();
    }
  });

  it("crops each half exactly to its own genuine double-line border plus a small fixed cushion, excluding the spine between them", async () => {
    // Confirmed directly against several real, already-uploaded cover PDFs
    // (2026-11-09): each half has its OWN complete double-line border
    // already in the source art -- back and front are independent, fully
    // enclosed boxes, not one shared frame with the spine left open. The
    // real bug was that a blind, fixed-percentage spine margin was cutting
    // the crop boundary right through that real border before any
    // detection code ever ran. The fix finds each half's own real border
    // directly (see findBorderClusters/findHalfBorders) and crops just past
    // its own inner (spine-facing) edge, by a small fixed cushion -- not by
    // mirroring its own outer-edge margin, which overshot into the spine
    // itself on a real cover whose outer margin was proportionally much
    // wider than its actual spine (found live 2026-11-09, later; see the
    // regression test below).
    //
    // This cover also has a dense dark "spine" fill between the halves
    // (never bright enough to read as a border stroke) and a one-row-only
    // bright smear inside the back cover's own content area, simulating a
    // line of real body text crossing whichever single row an older,
    // single-row scan would have sampled -- both must be ignored.
    const width = 700;
    const height = 200;
    const bg: [number, number, number] = [40, 30, 20];
    const border: [number, number, number] = [255, 230, 180];
    const spine: [number, number, number] = [15, 10, 8];

    const rgb = new Uint8Array(width * height * 3);
    const setPixel = (x: number, y: number, [r, g, b]: [number, number, number]) => {
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) setPixel(x, y, bg);
    }
    // Full-height double-line border stroke pair (a ~10px gap between the
    // two thin lines, like the real covers measured live).
    const drawDoubleLine = (outerX: number, innerDirection: 1 | -1) => {
      const innerX = outerX + innerDirection * 10;
      for (let y = 0; y < height; y++) {
        for (let dx = -1; dx <= 1; dx++) {
          setPixel(outerX + dx, y, border);
          setPixel(innerX + dx, y, border);
        }
      }
    };
    // Back's own border: outer (trim-side) at x=30, inner (spine-side) at
    // x=210 -- a 29px margin from the image's own left edge.
    drawDoubleLine(30, 1);
    drawDoubleLine(210, -1);
    // Front's own border: inner (spine-side) at x=490, outer (trim-side) at
    // x=670 -- a deliberately different, 28px margin from the image's own
    // right edge (699), proving each half's margin is measured
    // independently rather than copied from the other half.
    drawDoubleLine(490, 1);
    drawDoubleLine(670, -1);
    // The spine itself: a dark fill, comfortably inside the gap between
    // where both crops will end up, that should appear in neither.
    for (let y = 0; y < height; y++) {
      for (let x = 245; x <= 455; x++) setPixel(x, y, spine);
    }
    // A single-row-only bright smear inside the back cover's own content
    // area -- the exact shape of a line of body text crossing one sampled
    // row, which must NOT be treated as a third border cluster.
    for (let x = 100; x <= 150; x++) setPixel(x, 100, border);

    const pdf = buildTestCoverPdf(width, height, rgb);
    const { back, front } = await splitBookCoverPdf(pdf);

    const backImage = PhotonImage.new_from_byteslice(back);
    const frontImage = PhotonImage.new_from_byteslice(front);
    try {
      // Exact crop boundaries: each half ends/starts just past its own
      // inner border by the same small fixed cushion (1% of the 700px
      // width, rounded = 7px) -- not a margin mirrored from its own
      // (deliberately different, 29px vs 28px) outer-edge margin.
      expect(backImage.get_width()).toBe(218); // 211 + 7
      expect(frontImage.get_width()).toBe(218); // 700 - (489 - 7)

      const brightnessAt = (img: PhotonImage, x: number) => {
        const w = img.get_width();
        const h = img.get_height();
        const pixels = img.get_raw_pixels();
        const y = Math.floor(h / 2);
        const i = (y * w + x) * 4;
        return pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
      };
      const bgBrightness = bg[0] + bg[1] + bg[2];

      // Both of back's own border strokes survived (outer near x=30, inner
      // near x=200, well within its 241px-wide crop).
      expect(brightnessAt(backImage, 30)).toBeGreaterThan(bgBrightness + 120);
      expect(brightnessAt(backImage, 200)).toBeGreaterThan(bgBrightness + 120);
      // Both of front's own border strokes survived too, at their own
      // crop-local positions (front crop starts at original x=482: its
      // inner border's two stroke-lines land at local x=489-482=7 and
      // 499-482=17, its outer border's at 659-482=177 and 669-482=187).
      expect(brightnessAt(frontImage, 8)).toBeGreaterThan(bgBrightness + 120);
      expect(brightnessAt(frontImage, 178)).toBeGreaterThan(bgBrightness + 120);

      // The spine's dark fill, and the one-row text smear, both land
      // outside their respective crops -- no pixel in either final image
      // is anywhere near the spine's distinct color.
      const spineBrightness = spine[0] + spine[1] + spine[2];
      const containsSpineColor = (img: PhotonImage) => {
        const w = img.get_width();
        const h = img.get_height();
        const pixels = img.get_raw_pixels();
        for (let y = 0; y < h; y += 7) {
          for (let x = 0; x < w; x += 7) {
            const i = (y * w + x) * 4;
            const sum = pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
            if (Math.abs(sum - spineBrightness) < 15) return true;
          }
        }
        return false;
      };
      expect(containsSpineColor(backImage)).toBe(false);
      expect(containsSpineColor(frontImage)).toBe(false);
    } finally {
      backImage.free();
      frontImage.free();
    }
  });

  it("never bleeds spine content into either crop when a cover's outer margin is proportionally wider than its actual spine (REGRESSION, found live 2026-11-09, later)", async () => {
    // Reproduces the exact real failure shape found on the live "Revive Me"
    // cover: a wide outer (trim-side) margin relative to a comparatively
    // narrow actual spine. Mirroring the outer margin onto the spine side
    // (the pre-fix behavior) pushed each crop's boundary past the OTHER
    // half's own border entirely, bleeding the spine's own rotated title
    // text into both the back and front crops.
    const width = 500;
    const height = 100;
    const bg: [number, number, number] = [40, 30, 20];
    const border: [number, number, number] = [255, 230, 180];
    const spineText: [number, number, number] = [255, 255, 255];

    const rgb = new Uint8Array(width * height * 3);
    const setPixel = (x: number, y: number, [r, g, b]: [number, number, number]) => {
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) setPixel(x, y, bg);
    }
    const drawDoubleLine = (outerX: number, innerDirection: 1 | -1) => {
      const innerX = outerX + innerDirection * 8;
      for (let y = 0; y < height; y++) {
        for (let dx = -1; dx <= 1; dx++) {
          setPixel(outerX + dx, y, border);
          setPixel(innerX + dx, y, border);
        }
      }
    };
    // A wide 60px outer margin on each side (12% of the full width) --
    // proportionally much wider than the ~40px spine gap between the two
    // halves' own inner borders (back's inner edge at x=220, front's inner
    // edge at x=280).
    drawDoubleLine(60, 1); // back: outer at 60, inner at 68..then merged border spans to ~220
    drawDoubleLine(220, -1); // back's own inner (spine-facing) border
    drawDoubleLine(280, 1); // front's own inner (spine-facing) border
    drawDoubleLine(440, -1); // front: outer margin mirrors back's (500-440=60)
    // Spine title text, centered in the gap between the two inner borders
    // (220 to 280) -- exactly the content a bad crop would bleed in.
    for (let y = 20; y < 80; y++) {
      for (let x = 245; x <= 255; x++) setPixel(x, y, spineText);
    }

    const pdf = buildTestCoverPdf(width, height, rgb);
    const { back, front } = await splitBookCoverPdf(pdf);

    const backImage = PhotonImage.new_from_byteslice(back);
    const frontImage = PhotonImage.new_from_byteslice(front);
    try {
      // The two crops must never overlap -- back's crop must end before
      // front's crop begins in the original image's coordinate space.
      const backWidth = backImage.get_width();
      const frontWidth = frontImage.get_width();
      const frontCropStartInOriginal = width - frontWidth;
      expect(backWidth).toBeLessThanOrEqual(frontCropStartInOriginal);

      // Neither crop contains the spine title text's distinctive color.
      const textBrightness = spineText[0] + spineText[1] + spineText[2];
      const containsSpineText = (img: PhotonImage) => {
        const w = img.get_width();
        const h = img.get_height();
        const pixels = img.get_raw_pixels();
        for (let y = 0; y < h; y += 3) {
          for (let x = 0; x < w; x += 3) {
            const i = (y * w + x) * 4;
            const sum = pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
            if (Math.abs(sum - textBrightness) < 15) return true;
          }
        }
        return false;
      };
      expect(containsSpineText(backImage)).toBe(false);
      expect(containsSpineText(frontImage)).toBe(false);
    } finally {
      backImage.free();
      frontImage.free();
    }
  });

  it("equalizes the margin on all four sides of each half's border box, not just the spine side (per explicit requirement, 2026-11-09, latest)", async () => {
    // A genuine, fully-enclosed border box per half (left/right AND
    // top/bottom strokes, not full-height vertical lines like the other
    // tests here) with deliberately unequal natural margins on every side,
    // so the only way every margin check below can pass is if the crop
    // actually equalizes them down to the smallest one, rather than just
    // preserving whatever asymmetric margin the source happened to have.
    const width = 600;
    const height = 300;
    const bg: [number, number, number] = [40, 30, 20];
    const border: [number, number, number] = [255, 230, 180];

    const rgb = new Uint8Array(width * height * 3);
    const setPixel = (x: number, y: number, [r, g, b]: [number, number, number]) => {
      const i = (y * width + x) * 3;
      rgb[i] = r;
      rgb[i + 1] = g;
      rgb[i + 2] = b;
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) setPixel(x, y, bg);
    }
    const drawVLine = (x: number, yStart: number, yEnd: number) => {
      for (let y = yStart; y <= yEnd; y++) {
        for (let dx = -1; dx <= 1; dx++) setPixel(x + dx, y, border);
      }
    };
    const drawHLine = (y: number, xStart: number, xEnd: number) => {
      for (let x = xStart; x <= xEnd; x++) {
        for (let dy = -1; dy <= 1; dy++) setPixel(x, y + dy, border);
      }
    };
    // Back's own box: left=20 (margin ~19 from x=0), right=240 (a wide
    // margin from the spine, since the real spine gap dwarfs this box's own
    // side margins), top=30 (margin ~29 from y=0), bottom=260 (margin ~38
    // from y=299) -- deliberately closer to its own left/top than its own
    // bottom. The vertical strokes span the box's own top-to-bottom extent
    // (a real closed rectangle), which also keeps them within the >=80% of
    // full page height findVerticalBorderClusters needs to detect them.
    drawVLine(20, 30, 260);
    drawVLine(240, 30, 260);
    drawHLine(30, 20, 240);
    drawHLine(260, 20, 240);
    // Front's own box: left=360, right=560 (margin ~38 from x=599), top=50
    // (margin ~49 from y=0), bottom=270 (margin ~28 from y=299) -- a
    // visibly different shape/position from back's, deliberately closer to
    // its own right/bottom than its own top.
    drawVLine(360, 50, 270);
    drawVLine(560, 50, 270);
    drawHLine(50, 360, 560);
    drawHLine(270, 360, 560);

    const pdf = buildTestCoverPdf(width, height, rgb);
    const { back, front } = await splitBookCoverPdf(pdf);

    const backImage = PhotonImage.new_from_byteslice(back);
    const frontImage = PhotonImage.new_from_byteslice(front);
    try {
      // Finds where the border's bright stroke actually landed inside a
      // crop, independently in each direction -- self-verifying against the
      // crop's own real pixels rather than trusting hand-derived offset
      // arithmetic. Returns the first and last bright position along that
      // edge.
      const findBrightEdges = (img: PhotonImage, axis: "x" | "y") => {
        const w = img.get_width();
        const h = img.get_height();
        const pixels = img.get_raw_pixels();
        const bgBrightness = bg[0] + bg[1] + bg[2];
        const length = axis === "x" ? w : h;
        const mid = axis === "x" ? Math.floor(h / 2) : Math.floor(w / 2);
        const brightnessAt = (pos: number) => {
          const x = axis === "x" ? pos : mid;
          const y = axis === "x" ? mid : pos;
          const i = (y * w + x) * 4;
          return pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
        };
        let first = -1;
        let last = -1;
        for (let pos = 0; pos < length; pos++) {
          if (brightnessAt(pos) > bgBrightness + 120) {
            if (first === -1) first = pos;
            last = pos;
          }
        }
        return { first, last, length };
      };

      const backX = findBrightEdges(backImage, "x");
      const backY = findBrightEdges(backImage, "y");
      // Margin on every one of the four sides must be the same value --
      // that's exactly what "the border rectangle is centered" means.
      const backLeftMargin = backX.first;
      const backRightMargin = backX.length - 1 - backX.last;
      const backTopMargin = backY.first;
      const backBottomMargin = backY.length - 1 - backY.last;
      expect(backRightMargin).toBe(backLeftMargin);
      expect(backTopMargin).toBe(backLeftMargin);
      expect(backBottomMargin).toBe(backLeftMargin);
      // The box sits closer to its own left/top (~19px/~29px margins) than
      // its own bottom (~38px margin) in the source -- the equalized margin
      // must land near the smallest of those figures, not an average or
      // the largest one. A little slack accounts for the border stroke's
      // own width and JPEG re-encoding.
      expect(backLeftMargin).toBeLessThan(34);

      const frontX = findBrightEdges(frontImage, "x");
      const frontY = findBrightEdges(frontImage, "y");
      const frontLeftMargin = frontX.first;
      const frontRightMargin = frontX.length - 1 - frontX.last;
      const frontTopMargin = frontY.first;
      const frontBottomMargin = frontY.length - 1 - frontY.last;
      expect(frontRightMargin).toBe(frontLeftMargin);
      expect(frontTopMargin).toBe(frontLeftMargin);
      expect(frontBottomMargin).toBe(frontLeftMargin);
      // Front's box sits closer to its own bottom (~28px margin) than its
      // own right/top (~38px/~49px margins) -- same "smallest wins" check,
      // mirrored.
      expect(frontLeftMargin).toBeLessThan(34);
    } finally {
      backImage.free();
      frontImage.free();
    }
  });

  it("throws NoCoverImageFoundError when the PDF has no embedded image", async () => {
    const enc = new TextEncoder();
    // A minimal, image-free PDF (blank page, no XObject).
    const header = enc.encode("%PDF-1.4\n");
    const obj1 = enc.encode(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
    const obj2 = enc.encode(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
    const obj3 = enc.encode(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>\nendobj\n`);
    const xrefStart = header.length + obj1.length + obj2.length + obj3.length;
    const trailer = enc.encode(
      `xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    );
    const blankPdf = concatBytes([header, obj1, obj2, obj3, trailer]);

    await expect(splitBookCoverPdf(blankPdf)).rejects.toThrow(NoCoverImageFoundError);
  });

  it("throws CoverTooLargeError for an implausibly large page size (pre-decode guard)", async () => {
    // A tiny real image on a page declared 100in x 100in -- the physical
    // page-size guard should reject this before ever decoding the image.
    const rgb = solidColorRgb(4, 2, [255, 0, 0], [0, 0, 255]);
    const hugePage = buildTestCoverPdf(4, 2, rgb, { width: 100 * 72, height: 100 * 72 });

    await expect(splitBookCoverPdf(hugePage)).rejects.toThrow(CoverTooLargeError);
  });

  it("throws a generic error (not an unhandled crash) for a non-parseable file", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(splitBookCoverPdf(garbage)).rejects.toThrow();
  });
});
