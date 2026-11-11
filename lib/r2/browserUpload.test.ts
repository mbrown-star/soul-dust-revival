import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadFileToR2, UploadError } from "./browserUpload";
import { oversizeMessage } from "@/lib/uploads/limits";

afterEach(() => vi.unstubAllGlobals());

function fileOf(size: number) {
  const file = new File([new Uint8Array(1)], "photo.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("uploadFileToR2", () => {
  it("refuses a file over the cap, or an empty one, before contacting the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const args = { endpoint: "/api/admin/upload-url", request: { folder: "products" }, contentType: "image/png", maxBytes: 1000 };

    await expect(uploadFileToR2({ ...args, file: fileOf(1001) })).rejects.toThrow("the limit here is");
    await expect(uploadFileToR2({ ...args, file: fileOf(0) })).rejects.toThrow("empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the file's size with the request, and shows the server's message when it refuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_input", message: "File must be 20 MB or smaller" }), { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const err = await uploadFileToR2({
      endpoint: "/api/admin/upload-url",
      request: { folder: "products" },
      file: fileOf(500),
      contentType: "image/png",
      maxBytes: 1000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect((err as Error).message).toBe("File must be 20 MB or smaller");
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      folder: "products",
      contentType: "image/png",
      size: 500,
    });
  });

  it("turns a network failure into a readable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      uploadFileToR2({ endpoint: "/x", request: {}, file: fileOf(10), contentType: "text/vtt", maxBytes: 100 })
    ).rejects.toThrow("Check your connection");
  });
});

describe("oversizeMessage", () => {
  it("names both sizes, and is null within the cap", () => {
    expect(oversizeMessage(20 * 1024 * 1024, 20 * 1024 * 1024)).toBeNull();
    expect(oversizeMessage(34 * 1024 * 1024, 20 * 1024 * 1024)).toBe("This file is 34 MB; the limit here is 20 MB.");
    expect(oversizeMessage(2.5 * 1024 * 1024, 2 * 1024 * 1024)).toBe("This file is 2.5 MB; the limit here is 2 MB.");
  });
});
