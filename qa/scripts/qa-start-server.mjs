#!/usr/bin/env node
// Same isolation as qa-dev-server.mjs (DATABASE_URL forced to the local
// TEST_DATABASE_URL), but serves the last production build with `next start`
// instead of `next dev` -- usable while another `next dev` is already running
// in this folder, which Next refuses to start a second one alongside.
// Run `npm run build` first.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is not set in .env.local -- refusing to start the QA server.");
  process.exit(1);
}

// Port 3100 by default; pass another (`node qa/scripts/qa-start-server.mjs 3101`)
// when 3100 is taken, and point the suite at it with QA_BASE_URL.
const port = process.argv[2] ?? "3100";
const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PORT: port };
const child = spawn("npx", ["next", "start", "-p", port], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
