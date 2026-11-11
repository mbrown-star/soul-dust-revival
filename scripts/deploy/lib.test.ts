import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findInFiles,
  liveVersionFromDeployments,
  parseEnvFile,
  parseUploadOutput,
  placeholderEnv,
  runChecks,
  secretValues,
  TARGETS,
} from "./lib";

const REAL = parseEnvFile(`
# comment
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY="anon-key-value-1234"
R2_PUBLIC_BASE_URL=https://pub-123.r2.dev
R2_SECRET_ACCESS_KEY=r2-secret-value-abcdef
STRIPE_SECRET_KEY=sk_test_abcdefghijklmnop
SHORT=abc
CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123
`);

describe("parseEnvFile", () => {
  it("reads keys with digits, unquotes values, and skips comments", () => {
    expect(REAL.get("R2_PUBLIC_BASE_URL")).toBe("https://pub-123.r2.dev");
    expect(REAL.get("R2_SECRET_ACCESS_KEY")).toBe("r2-secret-value-abcdef");
    expect(REAL.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("anon-key-value-1234");
    expect([...REAL.keys()]).not.toContain("# comment");
  });
});

describe("placeholderEnv", () => {
  const exampleKeys = ["NEXT_PUBLIC_SUPABASE_URL", "R2_PUBLIC_BASE_URL", "R2_SECRET_ACCESS_KEY", "STRIPE_SECRET_KEY", "CLOUDFLARE_ACCOUNT_ID"];

  it("copies only the public build-time values and sets the site's hostnames and launch mode", () => {
    const { text, missing } = placeholderEnv(exampleKeys, REAL, TARGETS.production);
    const env = parseEnvFile(text);
    expect(missing).toEqual([]);
    expect(env.get("NEXT_PUBLIC_SUPABASE_URL")).toBe("https://abcdefgh.supabase.co");
    expect(env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe("anon-key-value-1234");
    expect(env.get("R2_PUBLIC_BASE_URL")).toBe("https://pub-123.r2.dev");
    expect(env.get("NEXT_PUBLIC_APP_HOSTNAME")).toBe("app.souldustrevival.com");
    expect(env.get("NEXT_PUBLIC_COOKIE_DOMAIN")).toBe(".souldustrevival.com");
    expect(env.get("NEXT_PUBLIC_LAUNCH_MODE")).toBe("sneak_peek");
    expect(env.get("CLOUDFLARE_ACCOUNT_ID")).toBe("");
  });

  it("never writes a secret", () => {
    const { text } = placeholderEnv(exampleKeys, REAL, TARGETS.staging);
    expect(text).not.toContain("r2-secret-value");
    expect(text).not.toContain("sk_test_");
    expect(parseEnvFile(text).get("STRIPE_SECRET_KEY")).toBe("placeholder");
    expect(parseEnvFile(text).get("NEXT_PUBLIC_LAUNCH_MODE")).toBe("");
  });

  it("reports a missing public value instead of building without it", () => {
    const partial = new Map(REAL);
    partial.delete("R2_PUBLIC_BASE_URL");
    partial.set("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(placeholderEnv(exampleKeys, partial, TARGETS.staging).missing).toEqual([
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "R2_PUBLIC_BASE_URL",
    ]);
  });
});

describe("secretValues and findInFiles", () => {
  it("scans for every non-public value long enough to be a secret, digits in the name included", () => {
    expect(secretValues(REAL).map((s) => s.key).sort()).toEqual(["CLOUDFLARE_ACCOUNT_ID", "R2_SECRET_ACCESS_KEY", "STRIPE_SECRET_KEY"]);
  });

  it("finds a secret anywhere in a nested build folder", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "deploy-lib-test-"));
    try {
      mkdirSync(path.join(dir, "server-functions", "default"), { recursive: true });
      writeFileSync(path.join(dir, "worker.js"), "const x = 1;");
      writeFileSync(path.join(dir, "server-functions", "default", "handler.mjs"), 'const k = "r2-secret-value-abcdef";');
      expect(findInFiles(dir, secretValues(REAL))).toEqual([
        { key: "R2_SECRET_ACCESS_KEY", file: path.join("server-functions", "default", "handler.mjs") },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("wrangler output", () => {
  it("reads the version id and preview link from an upload", () => {
    const out = `Uploaded soul-dust-revival-prod (11.38 sec)
Worker Version ID: 1319cc0f-9e46-4882-beb3-55a69584e18a
Version Preview URL: https://1319cc0f-soul-dust-revival-prod.matt-brown-8a1.workers.dev
`;
    expect(parseUploadOutput(out)).toEqual({
      versionId: "1319cc0f-9e46-4882-beb3-55a69584e18a",
      previewUrl: "https://1319cc0f-soul-dust-revival-prod.matt-brown-8a1.workers.dev",
    });
    expect(() => parseUploadOutput("✘ [ERROR] something")).toThrow();
  });

  it("finds the version serving the most traffic in the latest deployment", () => {
    const json = JSON.stringify([
      { versions: [{ version_id: "old", percentage: 100 }] },
      { versions: [{ version_id: "canary", percentage: 10 }, { version_id: "current", percentage: 90 }] },
    ]);
    expect(liveVersionFromDeployments(json)).toBe("current");
    expect(liveVersionFromDeployments("[]")).toBeNull();
  });
});

// ---------- runChecks against a fake site ----------

const R2 = "https://pub-123.r2.dev";
const COVER = `/_next/image?url=${encodeURIComponent(`${R2}/book-covers/a/front.jpg`)}&w=640&q=75`;

type Route = { status: number; location?: string; body?: string; type?: string };

function fakeSite(routes: Record<string, Route>) {
  return async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const key = `${init?.method ?? "GET"} ${u.pathname}${u.search}`;
    const route = routes[key];
    if (!route) return new Response("not found", { status: 404 });
    const headers = new Headers();
    if (route.location) headers.set("location", route.location);
    if (route.type) headers.set("content-type", route.type);
    return new Response(route.body ?? "", { status: route.status, headers });
  };
}

const coverHtml = `<img src="/_next/image?url=%2Fimages%2Fhero.jpg&amp;w=640"><img src="${COVER.replace(/&/g, "&amp;")}">`;

function healthyProduction(): Record<string, Route> {
  return {
    "GET /": { status: 200 },
    "GET /blog": { status: 200 },
    "GET /sneak-peek": { status: 200, body: coverHtml },
    "GET /store": { status: 307, location: "/" },
    "GET /checkout": { status: 307, location: "https://preview.example/" },
    "GET /signup": { status: 307, location: "/sneak-peek" },
    "POST /api/checkout": { status: 404 },
    "GET /library": { status: 307, location: "/login?next=/library" },
    "POST /api/admin/upload-url": { status: 403 },
    "POST /api/stream/sign-url": { status: 401 },
    [`GET ${COVER}`]: { status: 200, type: "image/jpeg" },
  };
}

const check = (routes: Record<string, Route>, target = TARGETS.production) =>
  runChecks({ baseUrl: "https://preview.example", target, r2PublicBaseUrl: R2, fetchFn: fakeSite(routes), pauseMs: 0 });

describe("runChecks", () => {
  it("passes a healthy sneak-peek production site", async () => {
    const results = await check(healthyProduction());
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(11);
  });

  it("fails when every page errors (a build with an empty Supabase value)", async () => {
    const routes = healthyProduction();
    for (const key of Object.keys(routes)) routes[key] = { status: 500 };
    const failed = (await check(routes)).filter((r) => !r.ok).map((r) => r.name);
    expect(failed).toContain("GET / is 200");
    expect(failed).toContain("a cover image on /sneak-peek loads");
  });

  it("fails when pages are fine but covers are refused (the missing R2 host)", async () => {
    const routes = healthyProduction();
    routes[`GET ${COVER}`] = { status: 400, type: "text/plain" };
    const failed = (await check(routes)).filter((r) => !r.ok);
    expect(failed.map((r) => r.name)).toEqual(["a cover image on /sneak-peek loads"]);
    expect(failed[0]!.detail).toBe("400");
  });

  it("fails when the page has no R2 cover at all", async () => {
    const routes = healthyProduction();
    routes["GET /sneak-peek"] = { status: 200, body: "<p>no covers</p>" };
    expect((await check(routes)).find((r) => r.name.startsWith("a cover image"))?.ok).toBe(false);
  });

  it("fails if the store opens on the sneak-peek site, or admin routes open to guests", async () => {
    const routes = healthyProduction();
    routes["GET /store"] = { status: 200 };
    routes["POST /api/admin/upload-url"] = { status: 400 };
    const failed = (await check(routes)).filter((r) => !r.ok).map((r) => r.name);
    expect(failed).toEqual(["/store redirects to /", "guest POST /api/admin/upload-url is refused (403)"]);
  });

  it("on the real marketing host, /library must go to the app host", async () => {
    const live = (location: string) =>
      runChecks({
        baseUrl: "https://souldustrevival.com",
        target: TARGETS.production,
        r2PublicBaseUrl: R2,
        fetchFn: fakeSite({ ...healthyProduction(), "GET /library": { status: 307, location } }),
        pauseMs: 0,
      }).then((results) => results.find((r) => r.name.startsWith("/library")));
    expect(await live("https://app.souldustrevival.com/library")).toMatchObject({ name: "/library goes to app.souldustrevival.com", ok: true });
    // Staying on the marketing host means the hostnames weren't baked in.
    expect((await live("/login?next=/library"))?.ok).toBe(false);
  });

  it("elsewhere (a preview link), /library must at least require a sign-in", async () => {
    const routes = healthyProduction();
    routes["GET /library"] = { status: 200 };
    expect((await check(routes)).find((r) => r.name === "/library asks a guest to sign in")?.ok).toBe(false);
  });

  it("expects an open store on staging, with the cover checked on /store", async () => {
    const routes: Record<string, Route> = {
      ...healthyProduction(),
      "GET /store": { status: 200, body: coverHtml },
      "GET /checkout": { status: 200 },
    };
    const results = await check(routes, TARGETS.staging);
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.map((r) => r.name)).not.toContain("/sneak-peek is 200");
  });

  it("retries once after a 5xx, so a cold start doesn't fail a healthy site", async () => {
    const routes = healthyProduction();
    let calls = 0;
    const flaky = async (url: string, init?: RequestInit) => {
      if (new URL(url).pathname === "/" && calls++ === 0) return new Response("", { status: 503 });
      return fakeSite(routes)(url, init);
    };
    const results = await runChecks({ baseUrl: "https://preview.example", target: TARGETS.production, r2PublicBaseUrl: R2, fetchFn: flaky, pauseMs: 0 });
    expect(results.filter((r) => !r.ok)).toEqual([]);
  });
});
