import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/r2/upload", async () => ({
  createPresignedUploadUrl: vi.fn(async (key: string, contentType: string) => ({
    uploadUrl: `https://r2.example.com/signed/${key}?ct=${contentType}`,
    publicUrl: `https://assets.example.com/${key}`,
  })),
  invalidUploadResponse: (await vi.importActual<typeof import("@/lib/r2/upload")>("@/lib/r2/upload"))
    .invalidUploadResponse,
}));

const PRODUCT = { target: "product", sizes: { source: 5_000_000, back: 2_000_000, front: 2_100_000 } };
const STUDY = { target: "study", sizes: { front: 2_100_000 } };

const { POST } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");
const { createPresignedUploadUrl } = await import("@/lib/r2/upload");

function request(body: unknown) {
  return new NextRequest("https://example.com/api/admin/cover-upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/cover-upload-urls", () => {
  beforeEach(() => {
    vi.mocked(createPresignedUploadUrl).mockClear();
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1" } as Awaited<ReturnType<typeof requireAdmin>>);
  });

  it("rejects a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await POST(request(PRODUCT));
    expect(res.status).toBe(403);
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("issues source PDF, back and front upload links for a product, all under one server-generated folder", async () => {
    const res = await POST(request(PRODUCT));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, { publicUrl: string }>;

    const folder = json.front!.publicUrl.match(/book-covers\/([0-9a-f-]{36})\/front\.jpg$/)?.[1];
    expect(folder).toBeDefined();
    expect(json.back!.publicUrl).toBe(`https://assets.example.com/book-covers/${folder}/back.jpg`);
    expect(json.source!.publicUrl).toBe(`https://assets.example.com/book-covers/${folder}/source.pdf`);
    expect(vi.mocked(createPresignedUploadUrl).mock.calls).toEqual(
      expect.arrayContaining([
        [`book-covers/${folder}/source.pdf`, "application/pdf", 5_000_000],
        [`book-covers/${folder}/back.jpg`, "image/jpeg", 2_000_000],
        [`book-covers/${folder}/front.jpg`, "image/jpeg", 2_100_000],
      ])
    );
  });

  it("issues only a front cover link for a study", async () => {
    const res = await POST(request(STUDY));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, { publicUrl: string }>;
    expect(Object.keys(json)).toEqual(["front"]);
    expect(json.front!.publicUrl).toMatch(/^https:\/\/assets\.example\.com\/study-covers\/[0-9a-f-]{36}\/front\.jpg$/);
  });

  it("gives every upload a fresh folder", async () => {
    const first = (await (await POST(request(STUDY))).json()) as { front: { publicUrl: string } };
    const second = (await (await POST(request(STUDY))).json()) as { front: { publicUrl: string } };
    expect(first.front.publicUrl).not.toBe(second.front.publicUrl);
  });

  it("rejects an unknown target or a client-supplied key", async () => {
    expect((await POST(request({ target: "blog", sizes: { front: 1 } }))).status).toBe(400);
    expect((await POST(request({ ...STUDY, key: "book-covers/../../evil.jpg" }))).status).toBe(400);
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("requires every file's size, and refuses a file over its cap with a readable message", async () => {
    expect((await POST(request({ target: "product", sizes: { front: 1 } }))).status).toBe(400);
    expect((await POST(request({ target: "study" }))).status).toBe(400);

    const tooBigPdf = await POST(request({ ...PRODUCT, sizes: { ...PRODUCT.sizes, source: 26 * 1024 * 1024 } }));
    expect(tooBigPdf.status).toBe(400);
    expect(((await tooBigPdf.json()) as { message: string }).message).toBe("File must be 25 MB or smaller");

    const tooBigCrop = await POST(request({ target: "study", sizes: { front: 31 * 1024 * 1024 } }));
    expect(tooBigCrop.status).toBe(400);
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
  });
});
