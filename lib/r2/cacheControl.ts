/**
 * Every object this app writes to R2 is stored under a server-generated
 * random UUID key (see SECURITY.md) and never overwritten in place -- a
 * replacement upload always gets a brand-new key. That makes every object
 * safe to cache as immutable: a URL that resolves today will resolve to the
 * exact same bytes forever. Without this, next/image's Cloudflare Images
 * binding has no "immutable" signal from the upstream R2 response (see
 * node_modules/@opennextjs/cloudflare's images.js), so it serves the
 * optimized image with no Cache-Control at all -- every page load/refresh
 * re-fetches and re-transforms from scratch instead of the browser serving
 * its own cached copy.
 *
 * This lives in its own zero-dependency module (not lib/r2/client.ts, which
 * constructs an S3Client against server-only credentials) so client
 * components can import the constant without pulling the R2 client/AWS SDK
 * into the browser bundle.
 */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
