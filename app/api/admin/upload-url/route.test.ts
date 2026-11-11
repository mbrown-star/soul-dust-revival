import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/r2/upload", async () => ({
  createPresignedUploadUrl: vi.fn(async (key: string) => ({
    uploadUrl: `https://r2.example.com/signed/${key}`,
    publicUrl: `https://assets.example.com/${key}`,
  })),
  invalidUploadResponse: (await vi.importActual<typeof import("@/lib/r2/upload")>("@/lib/r2/upload"))
    .invalidUploadResponse,
}));

const imageRoute = await import("./route");
const leaderRoute = await import("../leader-file-upload-url/route");
const captionsRoute = await import("../captions-upload-url/route");
const { requireAdmin } = await import("@/lib/admin/guard");
const { createPresignedUploadUrl } = await import("@/lib/r2/upload");

const MB = 1024 * 1024;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function request(body: unknown) {
  return new NextRequest("https://example.com/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function messageOf(res: Response) {
  return ((await res.json()) as { message: string }).message;
}

beforeEach(() => {
  vi.mocked(createPresignedUploadUrl).mockClear();
  vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin-1" } as Awaited<ReturnType<typeof requireAdmin>>);
});

describe("POST /api/admin/upload-url (images)", () => {
  it("rejects a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await imageRoute.POST(request({ folder: "products", contentType: "image/png", size: 1000 }));
    expect(res.status).toBe(403);
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("picks a fresh key in the requested folder and signs it for the exact size", async () => {
    const res = await imageRoute.POST(request({ folder: "products", contentType: "image/jpeg", size: 123_456 }));
    expect(res.status).toBe(200);
    const [key, contentType, size] = vi.mocked(createPresignedUploadUrl).mock.calls[0]!;
    expect(key).toMatch(new RegExp(`^products/${UUID}\\.jpg$`));
    expect(contentType).toBe("image/jpeg");
    expect(size).toBe(123_456);

    await imageRoute.POST(request({ folder: "content", contentType: "image/webp", size: 10 }));
    expect(vi.mocked(createPresignedUploadUrl).mock.calls[1]![0]).toMatch(new RegExp(`^content/${UUID}\\.webp$`));
  });

  it("refuses an image over 20 MB with a readable message, and accepts exactly 20 MB", async () => {
    const tooBig = await imageRoute.POST(request({ folder: "products", contentType: "image/png", size: 20 * MB + 1 }));
    expect(tooBig.status).toBe(400);
    expect(await messageOf(tooBig)).toBe("File must be 20 MB or smaller");
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();

    const atCap = await imageRoute.POST(request({ folder: "products", contentType: "image/png", size: 20 * MB }));
    expect(atCap.status).toBe(200);
  });

  it("refuses a missing, zero, fractional or negative size", async () => {
    for (const size of [undefined, 0, 1.5, -1, "1000"]) {
      const res = await imageRoute.POST(request({ folder: "products", contentType: "image/png", size }));
      expect(res.status).toBe(400);
    }
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it("refuses a client-supplied key, an unknown folder, or a non-image type", async () => {
    const bad = [
      { key: "products/../../evil.png", folder: "products", contentType: "image/png", size: 10 },
      { folder: "leader-resources", contentType: "image/png", size: 10 },
      { folder: "products", contentType: "image/svg+xml", size: 10 },
      { folder: "products", contentType: "text/html", size: 10 },
    ];
    for (const body of bad) expect((await imageRoute.POST(request(body))).status).toBe(400);
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/leader-file-upload-url (PDFs)", () => {
  it("is admin-only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await leaderRoute.POST(request({ contentType: "application/pdf", size: 10 }))).status).toBe(403);
  });

  it("picks the key itself and signs the exact size", async () => {
    const res = await leaderRoute.POST(request({ contentType: "application/pdf", size: 4_000_000 }));
    expect(res.status).toBe(200);
    const [key, contentType, size] = vi.mocked(createPresignedUploadUrl).mock.calls[0]!;
    expect(key).toMatch(new RegExp(`^leader-resources/${UUID}\\.pdf$`));
    expect([contentType, size]).toEqual(["application/pdf", 4_000_000]);
  });

  it("refuses a PDF over 100 MB, a client key, or a non-PDF", async () => {
    const tooBig = await leaderRoute.POST(request({ contentType: "application/pdf", size: 100 * MB + 1 }));
    expect(await messageOf(tooBig)).toBe("File must be 100 MB or smaller");
    expect((await leaderRoute.POST(request({ key: "x.pdf", contentType: "application/pdf", size: 10 }))).status).toBe(400);
    expect((await leaderRoute.POST(request({ contentType: "image/png", size: 10 }))).status).toBe(400);
    expect(createPresignedUploadUrl).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/captions-upload-url", () => {
  it("is admin-only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await captionsRoute.POST(request({ contentType: "text/vtt", size: 10 }))).status).toBe(403);
  });

  it("signs the exact size and refuses captions over 2 MB", async () => {
    expect((await captionsRoute.POST(request({ contentType: "text/vtt", size: 900 }))).status).toBe(200);
    expect(vi.mocked(createPresignedUploadUrl).mock.calls[0]![2]).toBe(900);

    const tooBig = await captionsRoute.POST(request({ contentType: "text/vtt", size: 2 * MB + 1 }));
    expect(await messageOf(tooBig)).toBe("File must be 2 MB or smaller");
    expect((await captionsRoute.POST(request({ contentType: "text/vtt" }))).status).toBe(400);
  });
});
