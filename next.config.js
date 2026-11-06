/** @type {import('next').NextConfig} */

// Derive the R2 image hostname from the real env var rather than
// hardcoding it, so this works whether R2_PUBLIC_BASE_URL is the default
// *.r2.dev domain or a custom domain attached to the bucket. Falls back to
// a harmless placeholder if the env var isn't set yet (e.g. first checkout
// of this repo, before .env is filled in) so `next build`/`next dev` don't
// crash on a missing/invalid URL.
function getR2Hostname() {
  try {
    return new URL(process.env.R2_PUBLIC_BASE_URL).hostname;
  } catch {
    return "example-not-configured.r2.dev";
  }
}

const nextConfig = {
  // pdf-parse (wrapping pdfjs-dist, used by the study-import PDF path) does
  // its own dynamic-import/relative-path resolution to find its worker
  // script, which breaks when Turbopack bundles it into the app's module
  // graph ("Setting up fake worker failed: Cannot find module
  // '.../pdf.worker.mjs'") -- every PDF import crashed server-side with an
  // empty response. Marking it external defers resolution to Node's own
  // require/import at runtime instead, which the package's internal paths
  // (and its optional @napi-rs/canvas dependency, a native addon Turpopack
  // can't place in an ESM chunk at all) are actually built for.
  // @cf-wasm/photon (image cropping for book/study cover PDFs) ships separate
  // entry points per runtime -- a "workerd" one that imports its .wasm file
  // directly (the form Wrangler's own bundler knows how to turn into a real,
  // build-time WASM module binding) and a "node" one that inlines the wasm
  // bytes as a JS literal and calls `new WebAssembly.Module(bytes)` at
  // *runtime* instead. Without this, `next build`'s own webpack bundling
  // resolves and fully inlines the package using Node's default conditions
  // (it doesn't know "workerd" exists) before OpenNext's later, Workers-aware
  // bundling pass -- which does request the "workerd" condition -- ever gets
  // a chance to see the unresolved import. By then it's just bundling
  // already-flattened JS, so its condition preference has nothing left to
  // act on. The deployed Worker was left with the "node" path's runtime
  // WebAssembly.Module() call, which Cloudflare Workers blocks outright
  // ("Wasm code generation disallowed by embedder") -- confirmed live via
  // `wrangler tail` against the real cover-PDF upload failure. Marking it
  // external, same as pdf-parse below, defers its resolution to the later
  // bundling stage that actually requests "workerd" and picks the right entry.
  // pdfjs-dist (the library pdf-parse wraps) is also imported directly, in
  // lib/import/pdfTextExtractionGlobals.ts, to register its worker module on
  // globalThis.pdfjsWorker before any text extraction runs (see that file's
  // comment for why). Its worker build is a standalone, self-contained
  // module meant to run in its own isolated context -- bundling it into the
  // main app chunk risks module-scope/global conflicts and unnecessary
  // bloat, so it's kept external the same way.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@cf-wasm/photon"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: getR2Hostname(),
      },
    ],
  },
  async headers() {
    return [
      {
        // Applies to every route.
        source: "/:path*",
        headers: [
          // Prevents the browser from MIME-sniffing a response away from the
          // declared Content-Type — mitigates certain content-injection attacks.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Disallows this site from being framed by other origins, preventing clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Limits how much referrer info is sent to other origins.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Forces HTTPS for this origin, including subdomains, for a year.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Disables browser features this app doesn't use.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

// Wires up Cloudflare bindings (R2, Hyperdrive, etc.) for `next dev`, so
// local dev sees the same platform bindings `wrangler`/the deployed Worker
// would. Explicitly gated to the dev server only -- unlike before adding the
// Hyperdrive binding, this is no longer a no-op during `next build`: with a
// `hyperdrive` entry in wrangler.jsonc, calling this unconditionally makes
// `next build` itself (including `npm run verify`, which never touches a
// request handler) fail with an unhandled rejection demanding a local
// Hyperdrive connection string it has no use for. `next build` runs through
// the OpenNext-built Worker instead, so this genuinely isn't needed there.
if (process.env.NODE_ENV === "development") {
  const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
  initOpenNextCloudflareForDev();
}
