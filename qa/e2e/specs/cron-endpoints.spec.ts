import { test, expect } from "@playwright/test";

// lib/social/cronAuth.ts: isValidCronRequest() checks the Authorization
// header is exactly `Bearer <CRON_SECRET>` via a timing-safe SHA-256
// comparison, and fails closed (returns false) if CRON_SECRET is unset.
// Every one of the 3 cron routes returns 403 {"error":"Forbidden"} on
// failure -- no 401, no 500, no stack trace.
const CRON_ROUTES = [
  "/api/cron/prune-login-events",
  "/api/cron/social-metrics",
  "/api/cron/social-publish",
];

test.describe("Cron endpoint auth gating", () => {
  for (const route of CRON_ROUTES) {
    test(`${route} rejects a request with no Authorization header`, async ({ request }) => {
      const res = await request.post(route);
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    test(`${route} rejects a request with a wrong bearer token`, async ({ request }) => {
      const res = await request.post(route, {
        headers: { Authorization: "Bearer not-the-real-secret" },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: "Forbidden" });
    });

    test(`${route} rejects a non-Bearer Authorization header`, async ({ request }) => {
      const res = await request.post(route, {
        headers: { Authorization: "Basic dXNlcjpwYXNz" },
      });
      expect(res.status()).toBe(403);
    });
  }
});
