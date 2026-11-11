import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));
const { POST } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

const request = (body: unknown) =>
  new NextRequest("https://example.com/api/admin/stream-upload-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

const fromBase64 = (v: string) => Buffer.from(v, "base64").toString("utf-8");

describe("POST /api/admin/stream-upload-url", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(requireAdmin).mockReset();
  });

  it("is admin-only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await POST(request({ size: 1000, name: "a.mp4" }))).status).toBe(403);
  });

  it("reserves a resumable upload for the file's exact size, private, with a duration cap and expiry", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u", email: "a@example.com", role: "admin" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 201, headers: { Location: "https://upload.cloudflarestream.com/tus/abc", "stream-media-id": "uid123" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(request({ size: 734_003_200, name: "Week 1 teaching.mp4" }));
    expect(await res.json()).toEqual({ uploadUrl: "https://upload.cloudflarestream.com/tus/abc", uid: "uid123" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toMatch(/\/stream\?direct_user=true$/);
    expect(init.headers["Tus-Resumable"]).toBe("1.0.0");
    expect(init.headers["Upload-Length"]).toBe("734003200");
    const meta = Object.fromEntries(init.headers["Upload-Metadata"]!.split(",").map((pair) => pair.split(" ") as [string, string?]));
    expect("requiresignedurls" in meta).toBe(true);
    expect(fromBase64(meta.maxDurationSeconds!)).toBe(String(4 * 60 * 60));
    expect(fromBase64(meta.name!)).toBe("Week 1 teaching.mp4");
    expect(new Date(fromBase64(meta.expiry!)).getTime()).toBeGreaterThan(Date.now() + 5 * 60 * 60 * 1000);
  });

  it("rejects a missing, zero or over-30 GB size", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u", email: "a@example.com", role: "admin" });
    vi.stubGlobal("fetch", vi.fn());
    for (const size of [undefined, 0, 31 * 1024 ** 3]) {
      expect((await POST(request({ size, name: "a.mp4" }))).status).toBe(400);
    }
  });

  it("answers 502 when Stream doesn't create the upload", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "u", email: "a@example.com", role: "admin" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(request({ size: 1000, name: "a.mp4" }))).status).toBe(502);
  });
});
