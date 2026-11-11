import { describe, expect, it, vi } from "vitest";
import { STREAM_UPLOAD_MAX_BYTES, uploadToStream } from "./uploads";

describe("uploadToStream", () => {
  it("refuses a file over Stream's 30 GB limit, or an empty one, before contacting the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const huge = new File([new Uint8Array(1)], "sermon.mp4", { type: "video/mp4" });
    Object.defineProperty(huge, "size", { value: STREAM_UPLOAD_MAX_BYTES + 1 });
    await expect(uploadToStream(huge)).rejects.toThrow(/up to 30 GB/);
    await expect(uploadToStream(new File([], "empty.mp4", { type: "video/mp4" }))).rejects.toThrow(/empty/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
