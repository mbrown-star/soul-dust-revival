import { describe, expect, it, vi } from "vitest";
import { STREAM_BASIC_UPLOAD_MAX_BYTES, uploadToStream } from "./uploads";

describe("uploadToStream", () => {
  it("refuses a file over Stream's 200 MB one-request limit before contacting the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const big = new File([new Uint8Array(1)], "sermon.mp4", { type: "video/mp4" });
    Object.defineProperty(big, "size", { value: STREAM_BASIC_UPLOAD_MAX_BYTES + 1 });
    await expect(uploadToStream(big)).rejects.toThrow(/limited to 200 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
