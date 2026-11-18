#!/usr/bin/env node
// PostToolUse (Edit|Write) on *.ts / *.tsx / *.mjs: run ESLint on that one
// file with the repo's own config and feed errors back (exit 2). Warnings are
// left to `npm run lint`. Never disables or overrides rules.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { block, existingDir, findUp, readHookInput } from "./lib.mjs";

const input = await readHookInput();
const filePath = input.tool_input?.file_path;
if (typeof filePath !== "string" || !/\.(ts|tsx|mjs)$/.test(filePath)) process.exit(0);

const abs = path.resolve(input.cwd || process.cwd(), filePath);
if (!existsSync(abs)) process.exit(0);

// The repo that owns the file, identified by its own local ESLint install.
const root = findUp(existingDir(path.dirname(abs)), path.join("node_modules", ".bin", "eslint"));
if (!root) process.exit(0);

const run = spawnSync(
  path.join(root, "node_modules", ".bin", "eslint"),
  ["--quiet", "--no-warn-ignored", "--format", "stylish", abs],
  { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }
);

if (run.status === 1) {
  const report = (run.stdout || run.stderr).trim();
  block(`ESLint errors in ${path.relative(root, abs)} — fix them (do not disable the rule):\n${report}`);
}
if (run.status !== 0) {
  block(`ESLint could not lint ${path.relative(root, abs)} (exit ${run.status ?? run.signal}):\n${(run.stderr || run.stdout).trim().slice(0, 2000)}`);
}
