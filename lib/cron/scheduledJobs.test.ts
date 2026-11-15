import { describe, expect, it, vi } from "vitest";
import { CRON_ROUTES, DAILY_CRON, PUBLISH_CRON, runScheduledCron } from "./scheduledJobs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const wranglerConfigText = readFileSync(join(__dirname, "../../wrangler.jsonc"), "utf-8");

describe("runScheduledCron", () => {
  it("posts to the publish route with the bearer token", async () => {
    const seen: Request[] = [];
    const appFetch = vi.fn(async (req: Request) => {
      seen.push(req);
      return new Response("{}", { status: 200 });
    });

    const results = await runScheduledCron(PUBLISH_CRON, "s3cret", appFetch);

    expect(results).toEqual([{ path: "/api/cron/social-publish", status: 200 }]);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("POST");
    expect(new URL(seen[0]!.url).pathname).toBe("/api/cron/social-publish");
    expect(seen[0]!.headers.get("authorization")).toBe("Bearer s3cret");
  });

  it("runs every daily route, even when one fails", async () => {
    const appFetch = vi.fn(async (req: Request) => {
      if (req.url.endsWith("/social-metrics")) throw new Error("boom");
      return new Response("{}", { status: 200 });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const results = await runScheduledCron(DAILY_CRON, "s3cret", appFetch);

    expect(results).toEqual([
      { path: "/api/cron/social-metrics", status: null, error: "boom" },
      { path: "/api/cron/prune-login-events", status: 200 },
    ]);
  });

  it("calls nothing without a secret or for an unknown expression", async () => {
    const appFetch = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await runScheduledCron(PUBLISH_CRON, undefined, appFetch)).toEqual([
      { path: "/api/cron/social-publish", status: null, error: "missing_secret" },
    ]);
    expect(await runScheduledCron("* * * * *", "s3cret", appFetch)).toEqual([]);
    expect(appFetch).not.toHaveBeenCalled();
  });

  it("matches the production Worker's cron triggers exactly, and staging has none", () => {
    const stripped = wranglerConfigText.replace(/^\s*\/\/.*$/gm, "");
    const config = JSON.parse(stripped) as {
      triggers?: { crons?: string[] };
      env: { production: { triggers?: { crons?: string[] } } };
    };
    expect(config.triggers?.crons).toEqual([]);
    expect([...(config.env.production.triggers?.crons ?? [])].sort()).toEqual(Object.keys(CRON_ROUTES).sort());
  });
});
