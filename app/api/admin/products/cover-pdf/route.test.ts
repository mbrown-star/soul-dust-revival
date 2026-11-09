import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const sendMock = vi.fn().mockResolvedValue({});
vi.mock("@/lib/r2/client", () => ({
  r2: { send: sendMock },
  R2_BUCKET: "test-bucket",
  r2PublicUrl: (key: string) => `https://assets.example.com/${key}`,
  IMMUTABLE_CACHE_CONTROL: "public, max-age=31536000, immutable",
}));

const { POST } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

/** Same minimal-PDF builder used in lib/images/bookCover.test.ts. */
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

function pdfRequest(body: FormData) {
  return new NextRequest("https://example.com/api/admin/products/cover-pdf", { method: "POST", body });
}

describe("POST /api/admin/products/cover-pdf", () => {
  it("rejects when not an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "cover.pdf", { type: "application/pdf" }));
    const res = await POST(pdfRequest(form));
    expect(res.status).toBe(403);
  });

  it("rejects a non-PDF content type", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1", email: "a@example.com", role: "admin" });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([1, 2, 3])], "cover.png", { type: "image/png" }));
    const res = await POST(pdfRequest(form));
    expect(res.status).toBe(400);
  });

  it("rejects a file over the 25MB cap", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1", email: "a@example.com", role: "admin" });
    const oversized = new Uint8Array(25 * 1024 * 1024 + 1);
    const form = new FormData();
    form.set("file", new File([oversized], "cover.pdf", { type: "application/pdf" }));
    const res = await POST(pdfRequest(form));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("file_too_large");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a PDF with no embedded cover image", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1", email: "a@example.com", role: "admin" });
    const enc = new TextEncoder();
    const header = enc.encode("%PDF-1.4\n");
    const obj1 = enc.encode(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
    const obj2 = enc.encode(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
    const obj3 = enc.encode(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >>\nendobj\n`);
    const xrefStart = header.length + obj1.length + obj2.length + obj3.length;
    const trailer = enc.encode(
      `xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
    );
    const blankPdf = concatBytes([header, obj1, obj2, obj3, trailer]);

    const form = new FormData();
    form.set("file", new File([Buffer.from(blankPdf)], "cover.pdf", { type: "application/pdf" }));
    const res = await POST(pdfRequest(form));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("no_cover_image_found");
  });

  it("rejects a non-parseable file with a clean 400 instead of a raw 500", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1", email: "a@example.com", role: "admin" });
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const form = new FormData();
    form.set("file", new File([Buffer.from(garbage)], "cover.pdf", { type: "application/pdf" }));

    const res = await POST(pdfRequest(form));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_pdf");
  });

  it("rejects an implausibly large page size", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1", email: "a@example.com", role: "admin" });
    const rgb = new Uint8Array(4 * 2 * 3);
    const hugePage = buildTestCoverPdf(4, 2, rgb, { width: 100 * 72, height: 100 * 72 });
    const form = new FormData();
    form.set("file", new File([Buffer.from(hugePage)], "cover.pdf", { type: "application/pdf" }));

    const res = await POST(pdfRequest(form));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("cover_too_large");
  });

  it("splits a valid cover PDF and uploads source + both images with server-generated keys", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1", email: "a@example.com", role: "admin" });
    sendMock.mockClear();

    const rgb = new Uint8Array(4 * 2 * 3);
    const pdfBytes = buildTestCoverPdf(4, 2, rgb);
    const form = new FormData();
    form.set("file", new File([Buffer.from(pdfBytes)], "my-cover.pdf", { type: "application/pdf" }));

    const res = await POST(pdfRequest(form));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      coverPdfUrl: string;
      backImageUrl: string;
      frontImageUrl: string;
      backImageWidth: number;
      backImageHeight: number;
      frontImageWidth: number;
      frontImageHeight: number;
    };

    expect(json.coverPdfUrl).toMatch(/^https:\/\/assets\.example\.com\/book-covers\/[0-9a-f-]+\/source\.pdf$/);
    expect(json.backImageUrl).toMatch(/^https:\/\/assets\.example\.com\/book-covers\/[0-9a-f-]+\/back\.jpg$/);
    expect(json.frontImageUrl).toMatch(/^https:\/\/assets\.example\.com\/book-covers\/[0-9a-f-]+\/front\.jpg$/);
    // Never derived from the uploaded filename.
    expect(json.coverPdfUrl).not.toContain("my-cover");
    // The real crop dimensions, for the storefront to render at the image's
    // own true aspect ratio instead of a fixed-ratio crop box.
    expect(json.backImageWidth).toBeGreaterThan(0);
    expect(json.backImageHeight).toBeGreaterThan(0);
    expect(json.frontImageWidth).toBeGreaterThan(0);
    expect(json.frontImageHeight).toBeGreaterThan(0);

    expect(sendMock).toHaveBeenCalledTimes(3);
    // Every uploaded object (source PDF + both crops) is cached as immutable --
    // each is stored under a fresh server-generated key, never overwritten in
    // place, so a long-lived Cache-Control is always safe and is what gives
    // next/image's Cloudflare Images binding an "immutable" signal to work with.
    for (const call of sendMock.mock.calls) {
      expect(call[0].input.CacheControl).toBe("public, max-age=31536000, immutable");
    }
  });
});
