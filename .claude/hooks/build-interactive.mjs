#!/usr/bin/env node
// PostToolUse (Edit|Write) on soul-dust-interactive/tools/**: rebuild with
// ./build.sh and check its summary lines (see build-summary.mjs). Exit 2 feeds
// the failing lines back to Claude. If pdfplumber is missing the build cannot
// run, and the hook says so rather than passing silently.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { checkBuildSummary } from "./build-summary.mjs";
import { block, readHookInput, toPosix } from "./lib.mjs";

const BUILD_TIMEOUT_MS = 10 * 60 * 1000;

const input = await readHookInput();
const filePath = input.tool_input?.file_path;
if (typeof filePath !== "string") process.exit(0);

const abs = toPosix(path.resolve(input.cwd || process.cwd(), filePath));
const m = abs.match(/^(.*\/soul-dust-interactive)\/tools\//);
if (!m) process.exit(0);
const projectDir = m[1] ?? "";

const probe = spawnSync("python3", ["-c", "import pdfplumber"], { cwd: projectDir, encoding: "utf8" });
if (probe.status !== 0) {
  block(
    "build.sh NOT run: pdfplumber is not installed for python3, so this soul-dust-interactive/tools change is unverified. " +
      "Install it (pip install -r soul-dust-interactive/requirements.txt) and rerun ./build.sh, or tell the user it was not checked."
  );
}

const run = spawnSync("./build.sh", [], {
  cwd: projectDir,
  encoding: "utf8",
  timeout: BUILD_TIMEOUT_MS,
  maxBuffer: 32 * 1024 * 1024,
});
const output = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
if (run.status !== 0) {
  const tail = output.trim().split("\n").slice(-15).join("\n");
  block(`soul-dust-interactive/build.sh failed (exit ${run.status ?? run.signal}):\n${tail}`);
}

const failures = checkBuildSummary(run.stdout ?? "");
if (failures.length) {
  block(`soul-dust-interactive/build.sh summary is off:\n${failures.join("\n")}`);
}
