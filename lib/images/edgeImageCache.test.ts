import { describe, expect, it, vi } from "vitest";
import { imageCacheKey, withEdgeImageCache, type EdgeCache } from "./edgeImageCache";

const IMG = "https://souldustrevival.com/_next/image?url=https%3A%2F%2Fcdn.example%2Ffront.jpg&w=640&q=75";
const WEBP_ACCEPT = "image/avif,image/webp,image/apng,*/*";

function fakeCache() {
  const store = new Map<string, Response>();
  const cache: EdgeCache = {
    match: vi.fn(async (req: Request) => store.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => {
      store.set(req.url, res);
    }),
  };
  return { cache, store };
}

function waitUntilCollector() {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) }, flush: () => Promise.all(pending) };
}

function imageResponse(body = "bytes", headers: Record<string, string> = {}, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=315360000, immutable", ...headers },
  });
}

describe("withEdgeImageCache", () => {
  it("resizes once, then serves the same image from the edge cache", async () => {
    const { cache } = fakeCache();
    const handle = vi.fn(async () => imageResponse("resized"));
    const req = () => new Request(IMG, { headers: { Accept: WEBP_ACCEPT } });

    const first = waitUntilCollector();
    expect(await (await withEdgeImageCache(req(), first.ctx, cache, handle)).text()).toBe("resized");
    await first.flush();

    const second = waitUntilCollector();
    const res = await withEdgeImageCache(req(), second.ctx, cache, handle);
    expect(await res.text()).toBe("resized");
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("keeps separate copies for browsers that accept different formats", async () => {
    const { cache } = fakeCache();
    const handle = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(imageResponse("webp"))
      .mockResolvedValueOnce(imageResponse("jpeg", { "Content-Type": "image/jpeg" }));

    const a = waitUntilCollector();
    await withEdgeImageCache(new Request(IMG, { headers: { Accept: WEBP_ACCEPT } }), a.ctx, cache, handle);
    await a.flush();
    const b = waitUntilCollector();
    const res = await withEdgeImageCache(new Request(IMG, { headers: { Accept: "image/*" } }), b.ctx, cache, handle);

    expect(await res.text()).toBe("jpeg");
    expect(handle).toHaveBeenCalledTimes(2);
  });

  it("doesn't store errors or responses that aren't immutable", async () => {
    const { cache } = fakeCache();
    for (const response of [
      imageResponse("bad", {}, 400),
      new Response("not immutable", { headers: { "Content-Type": "image/webp" } }),
    ]) {
      const c = waitUntilCollector();
      await withEdgeImageCache(new Request(IMG), c.ctx, cache, async () => response);
      await c.flush();
    }
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("leaves every other request alone", async () => {
    const { cache } = fakeCache();
    const handle = vi.fn(async () => new Response("page"));
    const c = waitUntilCollector();
    await withEdgeImageCache(new Request("https://souldustrevival.com/store"), c.ctx, cache, handle);
    await withEdgeImageCache(new Request(IMG, { method: "HEAD" }), c.ctx, cache, handle);
    expect(handle).toHaveBeenCalledTimes(2);
    expect(cache.match).not.toHaveBeenCalled();
  });

  it("still serves the image when the cache read fails", async () => {
    const cache: EdgeCache = {
      match: vi.fn(async () => {
        throw new Error("cache unavailable");
      }),
      put: vi.fn(async () => {
        throw new Error("cache unavailable");
      }),
    };
    const c = waitUntilCollector();
    const res = await withEdgeImageCache(new Request(IMG), c.ctx, cache, async () => imageResponse("ok"));
    await expect(c.flush()).resolves.toBeDefined();
    expect(await res.text()).toBe("ok");
  });
});

describe("imageCacheKey", () => {
  it("keeps the image's own query and adds the accepted formats", () => {
    const key = new URL(imageCacheKey(new Request(IMG, { headers: { Accept: WEBP_ACCEPT } })).url);
    expect(key.searchParams.get("w")).toBe("640");
    expect(key.searchParams.get("url")).toBe("https://cdn.example/front.jpg");
    expect(key.searchParams.get("__accept")).toBe("avif+webp");
    expect(new URL(imageCacheKey(new Request(IMG)).url).searchParams.get("__accept")).toBe("none");
  });
});
