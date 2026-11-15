/**
 * Cloudflare Cron Triggers for this app's own Worker.
 *
 * The cron routes under `/api/cron/*` only run when something calls them.
 * `custom-worker.ts` exports a `scheduled` handler that hands each trigger
 * here; this builds a request to the matching route and passes it straight
 * to the Next.js app inside the same Worker (no trip over the internet, so
 * Cloudflare Access on a staging host can't get in the way), with the
 * `CRON_SECRET` bearer token the routes check.
 *
 * The expressions must match `triggers.crons` in wrangler.jsonc. They're
 * set on the production Worker only: staging and production share one
 * database, so one scheduler is enough (and the publish route's atomic
 * claim would stop a double post anyway).
 *
 * Kept free of Worker-only globals so it can be unit-tested.
 */

export const PUBLISH_CRON = "*/10 * * * *";
export const DAILY_CRON = "0 6 * * *";

export const CRON_ROUTES: Record<string, readonly string[]> = {
  [PUBLISH_CRON]: ["/api/cron/social-publish"],
  [DAILY_CRON]: ["/api/cron/social-metrics", "/api/cron/prune-login-events"],
};

// Any absolute origin works: the request never leaves the Worker, and
// `/api` paths are served the same on every host.
const INTERNAL_ORIGIN = "https://souldustrevival.com";

export type AppFetch = (request: Request) => Promise<Response>;

export interface CronRunResult {
  path: string;
  status: number | null;
  error?: string;
}

/**
 * Runs every route registered for `cron`, one after another (they share the
 * Worker's small database connection budget). Never throws: a failing route
 * is logged and reported, and the others still run.
 */
export async function runScheduledCron(
  cron: string,
  cronSecret: string | undefined,
  appFetch: AppFetch
): Promise<CronRunResult[]> {
  const paths = CRON_ROUTES[cron];
  if (!paths) {
    console.error(`[cron] no routes registered for "${cron}"`);
    return [];
  }
  if (!cronSecret) {
    console.error("[cron] CRON_SECRET is not set; skipping");
    return paths.map((path) => ({ path, status: null, error: "missing_secret" }));
  }

  const results: CronRunResult[] = [];
  for (const path of paths) {
    try {
      const res = await appFetch(
        new Request(`${INTERNAL_ORIGIN}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cronSecret}` },
        })
      );
      if (!res.ok) console.error(`[cron] ${path} answered ${res.status}`);
      results.push({ path, status: res.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron] ${path} failed: ${message}`);
      results.push({ path, status: null, error: message });
    }
  }
  return results;
}
