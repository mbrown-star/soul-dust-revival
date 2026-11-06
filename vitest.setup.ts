import { existsSync } from "node:fs";

// Tests run as plain Node, not through Next.js, so nothing else loads
// .env.local automatically -- same pattern drizzle.config.ts already uses.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

// This project has no mocked DB layer by design (real DB behavior > asserting
// against mocks -- see CODE_QUALITY_REVIEW.md), so every test file does real
// inserts/deletes. DATABASE_URL itself is meant to point at the real,
// shared-with-staging Supabase project (so `next dev` and the deployed site
// see the same data) -- which is exactly what made it unsafe for tests to
// also use it: a test cleanup bug has leaked real data into that project
// twice (see CLAUDE.md's 2026-11-05 entries). Overriding DATABASE_URL here,
// unconditionally and only for the vitest process, means `npm test` always
// runs against the isolated local database in TEST_DATABASE_URL regardless
// of what DATABASE_URL is set to for dev -- no manual env-swapping required,
// and no way to forget. Failing loudly if it's unset is deliberate: silently
// falling back to DATABASE_URL would silently restore the exact risk this
// exists to close.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Tests must run against a local/disposable database, " +
      "never DATABASE_URL (which points at the real, shared-with-staging project). " +
      "See .env.example and BUILD_TASKS.md's \"3. Database\" section for setup."
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
