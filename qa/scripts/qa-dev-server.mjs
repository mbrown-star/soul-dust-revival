#!/usr/bin/env node
// Starts `next dev` on port 3100 with DATABASE_URL forced to
// TEST_DATABASE_URL (the isolated local Postgres), the same safety pattern
// vitest.setup.ts uses for `npm test` -- so the QA Playwright suite can
// never write into the real, shared-with-staging Supabase project no matter
// what DATABASE_URL happens to be in .env.local. Mirrors scripts/
// migrate-direct.mjs's pattern of pre-loading .env.local into a parent
// process before spawning the real command.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (!process.env.TEST_DATABASE_URL) {
  console.error(
    "TEST_DATABASE_URL is not set in .env.local -- refusing to start the QA dev server " +
      "(see qa/README.md \"Setup\")."
  );
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  // next.config.js calls initOpenNextCloudflareForDev() unconditionally in
  // dev mode, which throws without this set (see CLAUDE.md's 2026-11-05
  // Hyperdrive entry) -- pointed at the same isolated local Postgres so the
  // Worker-emulation path and the plain-Node getDb() fallback agree.
  CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: process.env.TEST_DATABASE_URL,
  PORT: "3100",
};

const child = spawn("npx", ["next", "dev", "-p", "3100"], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
