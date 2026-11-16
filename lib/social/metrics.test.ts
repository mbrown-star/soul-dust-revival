import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getConnection = vi.fn();
const freshXAccessToken = vi.fn();
vi.mock("@/lib/social/connections", () => ({ getConnection: (p: string) => getConnection(p) }));
vi.mock("@/lib/social/xToken", () => ({ freshXAccessToken: (c: unknown) => freshXAccessToken(c) }));

import { fetchMetrics } from "./metrics";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  getConnection.mockResolvedValue({
    accessToken: "tok",
    refreshToken: "r",
    tokenExpiresAt: null,
    displayName: null,
    externalAccountId: null,
  });
  freshXAccessToken.mockResolvedValue("fresh-tok");
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchMetrics", () => {
  it("X: refreshes the token and counts reposts plus quotes as shares", async () => {
    fetchMock.mockResolvedValue(
      json({ data: { public_metrics: { like_count: 4, reply_count: 2, retweet_count: 3, quote_count: 1, impression_count: 90 } } })
    );
    const m = await fetchMetrics("x", "123");
    expect(m).toEqual({ likes: 4, comments: 2, shares: 4, impressions: 90 });
    expect(freshXAccessToken).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe("Bearer fresh-tok");
  });

  it("X: a refused call still throws", async () => {
    fetchMock.mockResolvedValue(json({ title: "Unauthorized" }, 401));
    await expect(fetchMetrics("x", "123")).rejects.toThrow("401");
  });

  it("Facebook: keeps shares when likes and comments are refused", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("fields=shares") ? json({ id: "p", shares: { count: 5 } }) : json({ error: { code: 10 } }, 400)
    );
    expect(await fetchMetrics("facebook", "p")).toEqual({ likes: null, comments: null, shares: 5, impressions: null });
  });

  it("Facebook: a post nobody shared has no shares field, which is 0", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("fields=shares")
        ? json({ id: "p" })
        : json({ likes: { summary: { total_count: 2 } }, comments: { summary: { total_count: 1 } } })
    );
    expect(await fetchMetrics("facebook", "p")).toEqual({ likes: 2, comments: 1, shares: 0, impressions: null });
  });

  it("Facebook: throws when every call is refused", async () => {
    fetchMock.mockResolvedValue(json({ error: {} }, 400));
    await expect(fetchMetrics("facebook", "p")).rejects.toThrow();
  });

  it("Instagram: shares from Insights", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/insights")
        ? json({ data: [{ name: "shares", values: [{ value: 3 }] }] })
        : json({ like_count: 1, comments_count: 0 })
    );
    expect(await fetchMetrics("instagram", "m")).toEqual({ likes: 1, comments: 0, shares: 3, impressions: null });
  });

  it("Instagram: shares unknown without the Insights permission, likes kept", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/insights") ? json({ error: { code: 10 } }, 400) : json({ like_count: 1, comments_count: 0 })
    );
    expect(await fetchMetrics("instagram", "m")).toEqual({ likes: 1, comments: 0, shares: null, impressions: null });
  });
});
