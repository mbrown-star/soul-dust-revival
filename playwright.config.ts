import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Playwright doesn't load .env.local on its own (same reason vitest.setup.ts
// does this) -- global-setup needs NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY to build QA login sessions.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// QA/regression E2E suite — see qa/README.md for what this covers, how to
// run it, and the safety rules around which database/Supabase project it
// talks to. Deliberately NOT run as part of `npm run verify` (it needs a
// running dev server bound to the isolated local database, seeded fixtures,
// and real network access to Supabase Auth) — run explicitly via
// `npm run test:e2e`.
export default defineConfig({
  testDir: "./qa/e2e/specs",
  globalSetup: "./qa/e2e/global-setup.ts",
  // Deliberately NOT parallel: every spec shares one mutable local Postgres
  // (there's no per-test transaction rollback), and some real app behavior
  // is itself stateful across views -- e.g. simply opening a lesson pings
  // `lesson_progress` to "in_progress" (LessonNavigation's real, correct
  // behavior). A spec asserting a fixture's pristine "not started" state
  // (library-entitlements.spec.ts) would be flaky against another spec that
  // legitimately opens that same fixture's lesson (study-reader.spec.ts) if
  // both ran concurrently or out of order. Re-run `npm run qa:seed` between
  // full suite runs to reset fixture state.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "qa/playwright-report", open: "never" }]],
  outputDir: "qa/test-results",
  timeout: 30_000,
  use: {
    baseURL: process.env.QA_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    // Real WebKit (Safari's engine), not Chromium with a phone-sized
    // viewport -- mobile-chromium above is identical to desktop Chromium
    // under the hood (same network stack, same request-cancellation
    // behavior), so it can't reproduce a Safari-specific timing quirk no
    // matter how small the screen is. Scoped to qa/e2e/specs/race-
    // conditions/** only (not the whole suite) -- this project exists
    // specifically to catch timing/race bugs around navigation and
    // in-flight requests (see qa/CONVENTIONS.md "Testing for race
    // conditions"), not to triple-run the full functional suite.
    {
      name: "mobile-webkit",
      testMatch: /race-conditions\//,
      use: { ...devices["iPhone 14"] },
    },
  ],
});
