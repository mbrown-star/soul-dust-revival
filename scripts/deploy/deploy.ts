/**
 * Builds and ships committed code to staging and/or production, safely.
 *
 *   npm run deploy                     staging, then production (the default)
 *   npm run deploy -- staging          one site
 *   npm run deploy -- production
 *   npm run deploy -- both --no-promote   build, upload and check only
 *   npm run deploy -- both --yes          no confirmation before production
 *
 * For each site, in order (production only after staging succeeds):
 *  1. Builds the pushed commit in a clean temporary git worktree, so nothing
 *     uncommitted ships, with a placeholder .env.local that holds only the
 *     public build-time values and that site's hostnames and launch mode.
 *  2. Refuses to continue if a public build-time value is missing, if the
 *     bundle lacks the Supabase or R2 host, or if any real secret from
 *     .env.local appears anywhere in it.
 *  3. Uploads it as an inactive version and checks it on its own preview
 *     link (lib.ts runChecks). Live traffic is untouched until this passes.
 *  4. Switches all traffic to it, re-runs the checks live, and rolls back to
 *     the previous version automatically if any fail.
 *
 * Needs Node 22+ for wrangler (found automatically if Homebrew's node@22 is
 * installed) and a wrangler login. Never reads secrets into the build.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import {
  BUILD_TIME_PUBLIC_KEYS,
  findInFiles,
  liveVersionFromDeployments,
  parseEnvFile,
  parseUploadOutput,
  placeholderEnv,
  runChecks,
  secretValues,
  TARGETS,
  type CheckResult,
  type Target,
} from "./lib";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LOG_DIR = mkdtempSync(path.join(os.tmpdir(), "sdr-deploy-logs-"));

class DeployError extends Error {}

// ---------- arguments ----------

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const known = new Set(["--no-promote", "--yes", "--allow-unpushed"]);
for (const flag of flags) if (!known.has(flag)) fail(`Unknown option ${flag}.`);
const which = positional[0] ?? "both";
if (!["staging", "production", "both"].includes(which) || positional.length > 1) {
  fail(`Usage: npm run deploy -- [staging|production|both] [--no-promote] [--yes] [--allow-unpushed]`);
}
const targets: Target[] = which === "both" ? ["staging", "production"] : [which as Target];
const promote = !flags.has("--no-promote");

// ---------- helpers ----------

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function step(message: string) {
  console.log(`\n▸ ${message}`);
}

/** The PATH for child processes, with a Node 22+ first (wrangler requires it). */
function childPath(): string {
  const major = (bin: string) => {
    const out = spawnSync(bin, ["--version"], { encoding: "utf8" });
    return out.status === 0 ? Number(/^v(\d+)/.exec(out.stdout.trim())?.[1] ?? 0) : 0;
  };
  const current = process.env.PATH ?? "";
  if (major("node") >= 22) return current;
  for (const dir of ["/opt/homebrew/opt/node@22/bin", "/opt/homebrew/bin", "/usr/local/opt/node@22/bin", "/usr/local/bin"]) {
    if (existsSync(path.join(dir, "node")) && major(path.join(dir, "node")) >= 22) return `${dir}:${current}`;
  }
  return fail("wrangler needs Node 22 or newer, and none was found. Install it (brew install node@22) and try again.");
}

const realEnvPath = path.join(ROOT, ".env.local");
if (!existsSync(realEnvPath)) fail("No .env.local in the project; the public build values come from it.");
const realEnvText = readFileSync(realEnvPath, "utf8");
const realEnv = parseEnvFile(realEnvText);
const exampleKeys = [...parseEnvFile(readFileSync(path.join(ROOT, ".env.example"), "utf8")).keys()];
const envHash = () => createHash("sha256").update(readFileSync(realEnvPath)).digest("hex");
const envHashBefore = envHash();

// Child processes get the shell's environment minus every app variable, so a
// value exported in the shell can't override the placeholder and end up in
// the bundle (process.env wins over .env files in a Next build).
const childEnv: NodeJS.ProcessEnv = { ...process.env, PATH: childPath() };
for (const key of new Set([...realEnv.keys(), ...exampleKeys])) delete childEnv[key];
// opennextjs-cloudflare insists on this even when not emulating Hyperdrive locally.
childEnv.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = "postgresql://placeholder:placeholder@localhost:5432/placeholder";

/** Runs a command, logging its output to a file; returns the output, or throws with the log's tail. */
function run(label: string, cmd: string, cmdArgs: string[], cwd = ROOT): string {
  const logFile = path.join(LOG_DIR, `${label}.log`);
  const fd = openSync(logFile, "w");
  const result = spawnSync(cmd, cmdArgs, { cwd, env: childEnv, stdio: ["ignore", fd, fd] });
  closeSync(fd);
  const output = readFileSync(logFile, "utf8");
  if (result.status !== 0) {
    const tail = output.trim().split("\n").slice(-25).join("\n");
    throw new DeployError(`${label} failed (exit ${result.status}). Last lines, full log at ${logFile}:\n${tail}`);
  }
  return output;
}

function git(...gitArgs: string[]): string {
  const out = spawnSync("git", gitArgs, { cwd: ROOT, encoding: "utf8" });
  if (out.status !== 0) throw new DeployError(`git ${gitArgs.join(" ")} failed: ${out.stderr.trim()}`);
  return out.stdout.trim();
}

function printChecks(results: CheckResult[]): boolean {
  for (const r of results) console.log(`   ${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `  (got ${r.detail})`}`);
  return results.every((r) => r.ok);
}

function liveVersion(worker: string): string | null {
  return liveVersionFromDeployments(run(`${worker}-deployments`, "npx", ["wrangler", "deployments", "list", "--name", worker, "--json"]).replace(/^[^[]*/, ""));
}

async function confirm(question: string): Promise<boolean> {
  if (flags.has("--yes")) return true;
  if (!process.stdin.isTTY) fail(`${question} Re-run with --yes to answer yes without a prompt.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} [y/N] `);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

// ---------- one site ----------

type Shipped = { target: Target; versionId: string; previewUrl: string; promoted: boolean; previous: string | null };

async function ship(target: Target, sha: string): Promise<Shipped> {
  const config = TARGETS[target];
  console.log(`\n━━ ${target} (${config.worker}) ━━`);
  const previous = liveVersion(config.worker);
  console.log(`   live now: ${previous ?? "unknown"}`);

  const dir = mkdtempSync(path.join(os.tmpdir(), `sdr-deploy-${target}-`));
  try {
    step(`Checking out ${sha.slice(0, 7)} in a clean worktree`);
    git("worktree", "add", "--detach", dir, sha);
    // An APFS clone is near-instant on macOS; plain copy elsewhere.
    const clone = spawnSync("cp", ["-c", "-R", path.join(ROOT, "node_modules"), path.join(dir, "node_modules")]);
    if (clone.status !== 0) run(`${target}-copy-node-modules`, "cp", ["-R", path.join(ROOT, "node_modules"), path.join(dir, "node_modules")]);

    step("Writing the placeholder build env");
    const { text, missing } = placeholderEnv(exampleKeys, realEnv, config);
    if (missing.length) throw new DeployError(`.env.local has no value for ${missing.join(", ")}; a build without it breaks the live site.`);
    writeFileSync(path.join(dir, ".env.local"), text);
    console.log(`   public values: ${BUILD_TIME_PUBLIC_KEYS.join(", ")}; launch mode "${config.launchMode || "full store"}"`);

    step("Building (a few minutes)");
    run(`${target}-build`, "npx", ["opennextjs-cloudflare", "build"], dir);

    step("Checking the bundle");
    const bundle = path.join(dir, ".open-next");
    const leaks = findInFiles(bundle, secretValues(realEnv));
    if (leaks.length) {
      throw new DeployError(`Real secrets found in the build: ${leaks.map((l) => `${l.key} (${l.file})`).join(", ")}. Nothing was uploaded.`);
    }
    console.log(`   ✓ none of the ${secretValues(realEnv).length} real secrets in .env.local appear in it`);
    const required = [
      { key: "the Supabase host", value: new URL(realEnv.get("NEXT_PUBLIC_SUPABASE_URL")!).host },
      { key: "the R2 image host", value: new URL(realEnv.get("R2_PUBLIC_BASE_URL")!).host },
      { key: "the app hostname", value: config.appHost },
      ...(config.launchMode ? [{ key: `launch mode ${config.launchMode}`, value: config.launchMode }] : []),
    ];
    const present = new Set(findInFiles(bundle, required).map((f) => f.key));
    const absent = required.filter((r) => !present.has(r.key)).map((r) => r.key);
    if (absent.length) throw new DeployError(`The build is missing ${absent.join(", ")}. Nothing was uploaded.`);
    console.log(`   ✓ contains ${required.map((r) => r.key).join(", ")}`);

    step("Uploading as an inactive version (no traffic yet)");
    const uploadArgs = ["opennextjs-cloudflare", "upload", ...(config.wranglerEnv ? ["--env", config.wranglerEnv] : [])];
    const { versionId, previewUrl } = parseUploadOutput(run(`${target}-upload`, "npx", uploadArgs, dir));
    console.log(`   version ${versionId}\n   preview ${previewUrl}`);

    step("Checking the preview");
    const r2 = realEnv.get("R2_PUBLIC_BASE_URL")!;
    if (!printChecks(await runChecks({ baseUrl: previewUrl, target: config, r2PublicBaseUrl: r2 }))) {
      throw new DeployError(`The new version failed its checks on the preview link. Live traffic was not touched (still ${previous}).`);
    }

    if (!promote) return { target, versionId, previewUrl, promoted: false, previous };
    if (target === "production" && !(await confirm(`Switch all of ${config.liveUrl} to ${versionId.slice(0, 8)}?`))) {
      console.log("   left inactive; nothing changed live.");
      return { target, versionId, previewUrl, promoted: false, previous };
    }

    step("Switching all traffic to it");
    run(`${target}-promote`, "npx", ["wrangler", "versions", "deploy", `${versionId}@100%`, "--name", config.worker, "-y", "--message", `Deploy ${sha.slice(0, 7)}`]);

    step(`Checking live at ${config.liveUrl}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    if (!printChecks(await runChecks({ baseUrl: config.liveUrl, target: config, r2PublicBaseUrl: r2 }))) {
      if (!previous) throw new DeployError("Live checks failed and the previous version is unknown, so it couldn't be rolled back. Roll back by hand now.");
      step(`Rolling back to ${previous}`);
      run(`${target}-rollback`, "npx", ["wrangler", "versions", "deploy", `${previous}@100%`, "--name", config.worker, "-y", "--message", `Roll back ${versionId.slice(0, 8)}: live checks failed`]);
      throw new DeployError(`Live checks failed, so ${config.worker} was rolled back to ${previous}.`);
    }
    return { target, versionId, previewUrl, promoted: true, previous };
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: ROOT });
    spawnSync("git", ["worktree", "prune"], { cwd: ROOT });
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- main ----------

async function main() {
  const sha = git("rev-parse", "HEAD");
  console.log(`Deploying ${sha.slice(0, 7)} (${git("log", "-1", "--format=%s")}) to ${targets.join(", then ")}${promote ? "" : " (no promote)"}`);
  if (git("status", "--porcelain")) console.log("   note: uncommitted changes in this folder are not part of the deploy.");

  spawnSync("git", ["fetch", "-q", "origin", "main"], { cwd: ROOT });
  const pushed = spawnSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], { cwd: ROOT }).status === 0;
  if (!pushed && !flags.has("--allow-unpushed")) {
    fail(`${sha.slice(0, 7)} isn't on origin/main. Push it first (or pass --allow-unpushed).`);
  }

  const shipped: Shipped[] = [];
  try {
    for (const target of targets) shipped.push(await ship(target, sha));
  } catch (err) {
    if (!(err instanceof DeployError)) throw err;
    console.error(`\n✗ ${err.message}`);
    if (shipped.length) console.error(`   (already shipped: ${shipped.map((s) => `${s.target} ${s.versionId}`).join(", ")})`);
    process.exitCode = 1;
  } finally {
    if (envHash() !== envHashBefore) {
      console.error("\n✗ The project's .env.local changed during the deploy. Check it.");
      process.exitCode = 1;
    }
  }

  if (shipped.length) {
    console.log("\nSummary");
    for (const s of shipped) {
      console.log(`   ${s.target}: ${s.versionId} ${s.promoted ? `live (was ${s.previous})` : `uploaded, not live (preview ${s.previewUrl})`}`);
    }
  }
  if (!process.exitCode) rmSync(LOG_DIR, { recursive: true, force: true });
}

void main();
