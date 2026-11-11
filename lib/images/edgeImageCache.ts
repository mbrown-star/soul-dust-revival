/**
 * Edge cache for Next's image optimizer (`/_next/image`) on Cloudflare.
 *
 * OpenNext's image handler resizes every request with the IMAGES binding
 * (~1s for a cover) and never stores the result, because a Worker's own
 * responses don't go through Cloudflare's CDN cache. Browsers do cache the
 * result (it's marked immutable), but every new visitor, every new device,
 * and every different width paid the full resize again.
 *
 * This keeps each resized image in the data center's cache (Cache API), so
 * only the first request per data center does the work. Only responses the
 * handler itself marked immutable are stored: every image this app serves
 * lives at a key that never changes (random-UUID R2 keys, fingerprinted
 * static media), so a cached copy can never go stale. Anything else (an
 * error, a non-immutable upstream) passes through uncached.
 *
 * Kept free of Worker-only globals so it can be unit-tested with a fake
 * cache; `custom-worker.ts` wires it to `caches.default`.
 */

export const IMAGE_OPTIMIZER_PATH = "/_next/image";

/** The slice of Cloudflare's Cache API this needs. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

/** Lets the cache write finish after the response is already sent. */
export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The handler picks the output format from the Accept header (and answers
 * `Vary: Accept`), but the Cache API keys on the URL alone. So the key
 * carries which modern formats the browser accepts: two browsers share a
 * cached copy only if the handler would have given them the same bytes.
 */
export function imageCacheKey(request: Request): Request {
  const url = new URL(request.url);
  const accept = request.headers.get("Accept") ?? "";
  const formats = [
    accept.includes("image/avif") ? "avif" : "",
    accept.includes("image/webp") ? "webp" : "",
  ].filter(Boolean);
  url.searchParams.set("__accept", formats.join("+") || "none");
  return new Request(url.toString(), { method: "GET" });
}

export function isCacheableImageResponse(response: Response): boolean {
  return (
    response.status === 200 &&
    (response.headers.get("Cache-Control") ?? "").includes("immutable")
  );
}

export async function withEdgeImageCache(
  request: Request,
  ctx: WaitUntil,
  cache: EdgeCache,
  handle: () => Promise<Response>,
): Promise<Response> {
  if (request.method !== "GET" || new URL(request.url).pathname !== IMAGE_OPTIMIZER_PATH) {
    return handle();
  }

  const key = imageCacheKey(request);
  try {
    const cached = await cache.match(key);
    if (cached) return cached;
  } catch {
    // A cache read failing must never stop the image from being served.
  }

  const response = await handle();
  if (isCacheableImageResponse(response)) {
    ctx.waitUntil(cache.put(key, response.clone()).catch(() => undefined));
  }
  return response;
}
