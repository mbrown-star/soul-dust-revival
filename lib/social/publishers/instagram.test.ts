import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTAINER_POLL_ATTEMPTS, publishToInstagram } from "./instagram";

const json = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const params = { pageAccessToken: "tok", igUserId: "ig-1", body: "hello", imageUrl: "https://media.example/x.jpg", pollIntervalMs: 0 };

describe("publishToInstagram", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("waits for the container to finish before publishing", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: "container-1" }))
      .mockResolvedValueOnce(json({ status_code: "IN_PROGRESS" }))
      .mockResolvedValueOnce(json({ status_code: "FINISHED" }))
      .mockResolvedValueOnce(json({ id: "ig-post-1" }));

    await expect(publishToInstagram(params)).resolves.toEqual({ externalPostId: "ig-post-1" });

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[1]).toContain("/container-1?fields=status_code");
    expect(urls[2]).toContain("/container-1?fields=status_code");
    expect(urls[3]).toContain("/ig-1/media_publish");
  });

  it("doesn't publish a container Instagram couldn't process", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "container-1" })).mockResolvedValueOnce(json({ status_code: "ERROR" }));

    await expect(publishToInstagram(params)).rejects.toThrow(/status ERROR/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up if the container never finishes", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "container-1" }));
    fetchMock.mockResolvedValue(json({ status_code: "IN_PROGRESS" }));

    await expect(publishToInstagram(params)).rejects.toThrow(/still processing/);
    expect(fetchMock).toHaveBeenCalledTimes(1 + CONTAINER_POLL_ATTEMPTS);
  });
});
