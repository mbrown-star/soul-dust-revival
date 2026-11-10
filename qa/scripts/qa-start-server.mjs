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

const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PORT: "3100" };
const child = spawn("npx", ["next", "start", "-p", "3100"], { env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
