import { describe, it, expect, vi } from "vitest";
import { postWithRetry } from "./postWithRetry";

const noSleep = vi.fn(async () => {});

function respond(status: number) {
  return new Response(null, { status });
}

describe("postWithRetry", () => {
  it("returns the first answer when it succeeds, without retrying", async () => {
    const fetchImpl = vi.fn(async () => respond(200));
    const res = await postWithRetry("/x", { fetchImpl, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("/x", { method: "POST" });
  });

  it("retries after a request that never got an answer (stale connection)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValueOnce(respond(200));
    const sleep = vi.fn(async () => {});
    const res = await postWithRetry("/x", { fetchImpl, sleep, delaysMs: [400, 1200] });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(400);
  });

  it("retries a 5xx and returns the later success", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respond(503))
      .mockResolvedValueOnce(respond(502))
      .mockResolvedValueOnce(respond(200));
    const res = await postWithRetry("/x", { fetchImpl, sleep: noSleep, delaysMs: [1, 1] });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("never retries a 4xx (a blocked email or a conflicting account)", async () => {
    for (const status of [401, 403, 409]) {
      const fetchImpl = vi.fn(async () => respond(status));
      const res = await postWithRetry("/x", { fetchImpl, sleep: noSleep });
      expect(res.status).toBe(status);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("throws the last network error once every try has failed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Load failed");
    });
    await expect(postWithRetry("/x", { fetchImpl, sleep: noSleep, delaysMs: [1, 1] })).rejects.toThrow("Load failed");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("returns the last 5xx once every try has failed", async () => {
    const fetchImpl = vi.fn(async () => respond(500));
    const res = await postWithRetry("/x", { fetchImpl, sleep: noSleep, delaysMs: [1] });
    expect(res.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
