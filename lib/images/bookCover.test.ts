import { describe, expect, it } from "vitest";
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
