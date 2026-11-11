// The pure parts of scripts/deploy/deploy.ts: what each site is, how the
// placeholder build env is written, how a build is scanned for secrets, how
// wrangler's output is read, and what "the site works" means. No process,
// network or filesystem side effects except where a function says so, so all
// of it is unit-tested (lib.test.ts).

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type Target = "staging" | "production";

export type TargetConfig = {
  /** The Cloudflare Worker's name. */
  worker: string;
  /** wrangler's `--env`, or null for the top-level (staging) Worker. */
  wranglerEnv: string | null;
  marketingHost: string;
  appHost: string;
  cookieDomain: string;
  /** NEXT_PUBLIC_LAUNCH_MODE: "" builds the full site, "sneak_peek" closes the store. */
  launchMode: "" | "sneak_peek";
  /** Where the live site can be checked without a Cloudflare Access login. */
  liveUrl: string;
};

export const TARGETS: Record<Target, TargetConfig> = {
  staging: {
    worker: "soul-dust-revival",
    wranglerEnv: null,
    marketingHost: "staging.souldustrevival.com",
    appHost: "app.staging.souldustrevival.com",
    cookieDomain: ".staging.souldustrevival.com",
    launchMode: "",
    // staging.souldustrevival.com is behind Cloudflare Access; the workers.dev
    // address serves the same Worker without it.
    liveUrl: "https://soul-dust-revival.matt-brown-8a1.workers.dev",
  },
  production: {
    worker: "soul-dust-revival-prod",
    wranglerEnv: "production",
    marketingHost: "souldustrevival.com",
    appHost: "app.souldustrevival.com",
    cookieDomain: ".souldustrevival.com",
    launchMode: "sneak_peek",
    liveUrl: "https://souldustrevival.com",
  },
};

// Next inlines these at build time (NEXT_PUBLIC_*), or next.config.js reads
// them at build time (R2_PUBLIC_BASE_URL -> images.remotePatterns). They're
// public by design, so they're the only real values a build ever gets. An
// empty one doesn't fail the build; it breaks the live site (sign-in, cover
// images), which is why a missing one stops the deploy here instead.
export const BUILD_TIME_PUBLIC_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "R2_PUBLIC_BASE_URL"];

// Names with digits (R2_*) are real keys too; a pattern without 0-9 once
// silently dropped R2_PUBLIC_BASE_URL from every build.
const ENV_LINE = /^([A-Z0-9_]+)=(.*)$/;

/** Parses KEY=value lines (ignoring comments and blanks), unquoting quoted values. */
export function parseEnvFile(text: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line.trim());
    if (!match) continue;
    const [, key, raw] = match as unknown as [string, string, string];
    const value = raw.trim().replace(/^(["'])(.*)\1$/, "$2");
    if (!values.has(key)) values.set(key, value);
  }
  return values;
}

/**
 * The build-only .env.local: every key the app knows (from .env.example) set
 * to "placeholder", except the public build-time values (copied from the real
 * .env.local), the target's hostnames and launch mode, and
 * CLOUDFLARE_ACCOUNT_ID (left blank: wrangler reads it to pick the account,
 * and the real one comes from wrangler's own login). Secrets stay out of the
 * bundle because they're never written here; the Worker gets them at runtime
 * from its own secrets.
 */
export function placeholderEnv(
  exampleKeys: string[],
  real: Map<string, string>,
  target: TargetConfig
): { text: string; missing: string[] } {
  const fixed: Record<string, string> = {
    NEXT_PUBLIC_MARKETING_HOSTNAME: target.marketingHost,
    NEXT_PUBLIC_APP_HOSTNAME: target.appHost,
    NEXT_PUBLIC_COOKIE_DOMAIN: target.cookieDomain,
    NEXT_PUBLIC_LAUNCH_MODE: target.launchMode,
    CLOUDFLARE_ACCOUNT_ID: "",
  };
  const missing: string[] = [];
  for (const key of BUILD_TIME_PUBLIC_KEYS) {
    const value = real.get(key) ?? "";
    if (!value) missing.push(key);
    fixed[key] = value;
  }
  const keys = [...new Set([...exampleKeys, ...Object.keys(fixed)])];
  const text = keys.map((key) => `${key}=${key in fixed ? fixed[key] : "placeholder"}`).join("\n") + "\n";
  return { text, missing };
}

/** The real values that must never appear in a build: everything but the public ones. */
export function secretValues(real: Map<string, string>): { key: string; value: string }[] {
  return [...real]
    .filter(([key]) => !key.startsWith("NEXT_PUBLIC_") && key !== "R2_PUBLIC_BASE_URL")
    .filter(([, value]) => value.length >= 12 && value !== "placeholder")
    .map(([key, value]) => ({ key, value }));
}

/** Every file under a directory (reads the filesystem). */
export function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listFiles(full));
    else files.push(full);
  }
  return files;
}

/** Which of `needles` occur in any file under `dir`, and where (reads the filesystem). */
export function findInFiles(dir: string, needles: { key: string; value: string }[]): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  const remaining = new Set(needles);
  for (const file of listFiles(dir)) {
    if (remaining.size === 0) break;
    const content = readFileSync(file);
    for (const needle of [...remaining]) {
      if (content.includes(needle.value)) {
        found.push({ key: needle.key, file: path.relative(dir, file) });
        remaining.delete(needle);
      }
    }
  }
  return found;
}

/** The version id and preview link from `opennextjs-cloudflare upload` / `wrangler versions upload`. */
export function parseUploadOutput(output: string): { versionId: string; previewUrl: string } {
  const versionId = /Worker Version ID:\s*([0-9a-f-]{36})/i.exec(output)?.[1];
  const previewUrl = /Version Preview URL:\s*(https:\/\/\S+)/i.exec(output)?.[1];
  if (!versionId || !previewUrl) {
    throw new Error("Couldn't find the version id and preview URL in the upload output.");
  }
  return { versionId, previewUrl: previewUrl.replace(/\/$/, "") };
}

type DeploymentJson = { versions?: { version_id: string; percentage: number }[] };

/** The version serving the most traffic, from `wrangler deployments list --json` (oldest first). */
export function liveVersionFromDeployments(json: string): string | null {
  const deployments = JSON.parse(json) as DeploymentJson[];
  const latest = deployments.at(-1);
  const top = [...(latest?.versions ?? [])].sort((a, b) => b.percentage - a.percentage)[0];
  return top?.version_id ?? null;
}

// ---------- What "the site works" means ----------

export type CheckResult = { name: string; ok: boolean; detail: string };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** One request, retried once after a pause on a network error or 5xx (a cold start). */
async function request(fetchFn: Fetch, url: string, init: RequestInit = {}, pauseMs = 2000): Promise<Response | Error> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetchFn(url, { redirect: "manual", ...init });
      if (res.status < 500 || attempt > 0) return res;
    } catch (err) {
      if (attempt > 0) return err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
}

function describe(res: Response | Error): string {
  if (res instanceof Error) return `request failed (${res.message})`;
  const location = res.headers.get("location");
  return location ? `${res.status} -> ${location}` : String(res.status);
}

/**
 * Checks a deployed version, at its preview link or live. Covers what has
 * actually broken before: pages erroring (a missing build-time value), the
 * sneak-peek gates, the marketing/app hostname split, admin routes open to
 * guests, and R2 cover images through next/image (broken for most of
 * 2026-11-11 while every page still returned 200).
 */
export async function runChecks({
  baseUrl,
  target,
  r2PublicBaseUrl,
  fetchFn = fetch,
  pauseMs,
}: {
  baseUrl: string;
  target: TargetConfig;
  r2PublicBaseUrl: string;
  fetchFn?: Fetch;
  pauseMs?: number;
}): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const get = (p: string, init?: RequestInit) => request(fetchFn, new URL(p, baseUrl).toString(), init, pauseMs);
  const add = (name: string, res: Response | Error, ok: boolean) => results.push({ name, ok, detail: describe(res) });

  const status = async (p: string, expected: number, init?: RequestInit, name = `${init?.method ?? "GET"} ${p} is ${expected}`) => {
    const res = await get(p, init);
    add(name, res, !(res instanceof Error) && res.status === expected);
  };
  // A redirect to a path on the same host (preview links keep their own host).
  const redirectsTo = async (p: string, toPath: string) => {
    const res = await get(p);
    const location = res instanceof Error ? null : res.headers.get("location");
    const ok = !(res instanceof Error) && res.status >= 300 && res.status < 400 && location !== null &&
      new URL(location, baseUrl).pathname === toPath;
    add(`${p} redirects to ${toPath}`, res, ok);
  };

  const guestPost = { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" };
  const sneakPeek = target.launchMode === "sneak_peek";

  await status("/", 200);
  await status("/blog", 200);
  if (sneakPeek) {
    await status("/sneak-peek", 200);
    await redirectsTo("/store", "/");
    await redirectsTo("/checkout", "/");
    await redirectsTo("/signup", "/sneak-peek");
    await status("/api/checkout", 404, guestPost, "POST /api/checkout is closed (404)");
  } else {
    await status("/store", 200);
    await status("/checkout", 200);
  }

  // The reading app lives on its own host. proxy.ts only sends a visitor
  // across when they arrive on the marketing host itself, so that's checked
  // live on the real domain; on a preview link or workers.dev address,
  // /library must still require a sign-in. (The bundle check already
  // confirmed the hostnames were baked in.)
  const library = await get("/library");
  const libraryLocation = library instanceof Error ? null : library.headers.get("location");
  const libraryTarget = libraryLocation ? new URL(libraryLocation, baseUrl) : null;
  if (new URL(baseUrl).host === target.marketingHost) {
    add(
      `/library goes to ${target.appHost}`,
      library,
      libraryTarget !== null && libraryTarget.host === target.appHost && libraryTarget.pathname === "/library"
    );
  } else {
    add(
      "/library asks a guest to sign in",
      library,
      libraryTarget !== null && libraryTarget.pathname === "/login" && libraryTarget.searchParams.get("next") === "/library"
    );
  }

  await status("/api/admin/upload-url", 403, guestPost, "guest POST /api/admin/upload-url is refused (403)");
  await status("/api/stream/sign-url", 401, guestPost, "guest POST /api/stream/sign-url is refused (401)");

  // A real R2 cover through next/image.
  const coverPage = sneakPeek ? "/sneak-peek" : "/store";
  const page = await get(coverPage);
  const html = page instanceof Error || page.status !== 200 ? "" : await page.text();
  const encodedR2 = encodeURIComponent(r2PublicBaseUrl.replace(/\/$/, ""));
  const imagePath = html
    .match(/\/_next\/image\?url=[^"'\s]+/g)
    ?.map((src) => src.replace(/&amp;/g, "&"))
    .find((src) => src.startsWith(`/_next/image?url=${encodedR2}`));
  if (!imagePath) {
    results.push({ name: `a cover image on ${coverPage} loads`, ok: false, detail: `no R2 cover image found on ${coverPage}` });
  } else {
    const image = await get(imagePath);
    const type = image instanceof Error ? "" : image.headers.get("content-type") ?? "";
    add(`a cover image on ${coverPage} loads`, image, !(image instanceof Error) && image.status === 200 && type.startsWith("image/"));
  }

  return results;
}
