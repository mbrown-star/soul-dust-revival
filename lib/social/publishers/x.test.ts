import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishToX } from "./x";

describe("publishToX", () => {
  const originalR2Url = process.env.R2_PUBLIC_BASE_URL;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.R2_PUBLIC_BASE_URL = "https://assets.souldustrevival.com";
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    process.env.R2_PUBLIC_BASE_URL = originalR2Url;
    vi.unstubAllGlobals();
  });

  it("rejects an imageUrl on a different host (SSRF guard)", async () => {
    await expect(
      publishToX({
        accessToken: "token",
        body: "hello",
        imageUrl: "http://169.254.169.254/latest/meta-data/",
      })
    ).rejects.toThrow(/own R2 bucket/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an imageUrl on a visually-similar but different host", async () => {
    await expect(
      publishToX({
        accessToken: "token",
        body: "hello",
        imageUrl: "https://assets.souldustrevival.com.evil.example/x.jpg",
      })
    ).rejects.toThrow(/own R2 bucket/);
  });

  it("allows an imageUrl on the configured R2 public host", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ media_id_string: "media-1" }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: "tweet-1" } }) } as Response);

    const result = await publishToX({
      accessToken: "token",
      body: "hello",
      imageUrl: "https://assets.souldustrevival.com/products/abc.jpg",
    });

    expect(result).toEqual({ externalPostId: "tweet-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("posts without touching fetch's image path when no imageUrl is given", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { id: "tweet-2" } }) } as Response);

    const result = await publishToX({ accessToken: "token", body: "hello" });

    expect(result).toEqual({ externalPostId: "tweet-2" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
