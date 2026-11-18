#!/usr/bin/env node
// Stop: don't end a turn on code that fails `npm run verify`.
//
// Runs verify only when code changed since the last passing run: the
// fingerprint is HEAD + `git diff HEAD` (Markdown and docs/ excluded) +
// untracked files under app/ components/ lib/ scripts/. A clean tree, or a
// tree whose fingerprint already passed (cached in .claude/.verify-stamp,
// git-ignored), is not re-verified.
//
// When the changes touch checkout, webhooks, entitlements or the schema, also
// require `npm test` to have run after the last edit to those files, or the
// final reply to say plainly why it couldn't (no local Postgres).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { block, readHookInput } from "./lib.mjs";

const VERIFY_TIMEOUT_MS = 18 * 60 * 1000;
const CODE_DIRS = ["app", "components", "lib", "scripts"];
const DIFF_SCOPE = [".", ":(exclude)*.md", ":(exclude)docs"];
const SENSITIVE = [/^lib\/entitlements\//, /^app\/api\/checkout/, /^app\/api\/webhooks?\//, /^lib\/stripe\/webhook/, /^lib\/db\/schema\.ts$/];
const TEST_CMD = /\bnpm\s+(?:run\s+)?test(?![\w:-])|\bvitest\b(?![^\n]*qa\/hooks)/;
const SENSITIVE_IN_COMMAND = /lib\/entitlements\/|app\/api\/checkout|app\/api\/webhooks?\/|lib\/stripe\/webhook|lib\/db\/schema\.ts/;
// A Bash command that names a sensitive file and could have changed it.
const WRITES = /\s-i\b|>|\btee\b|\bmv\b|\bcp\b|\bgit\s+(apply|checkout|restore|merge|cherry-pick|stash|reset)\b/;
const MENTIONS_TESTS = /npm test|\btests?\b/i;
const NOT_RUN = /couldn['’]?t|could not|can['’]?t|cannot|unable|not run|didn['’]?t run|did not run|wasn['’]?t run|weren['’]?t run|skipped/i;
const DB_REASON = /postgres|TEST_DATABASE_URL|database|\bdb\b/i;

/**
 * Env for `npm run verify`. A session worktree has no .env.local, and
 * `next build` fails without the server keys, so fill every .env.example key
 * that isn't already set with "placeholder" (as scripts/deploy/deploy.ts does
 * for its clean build). NEXT_PUBLIC_LAUNCH_MODE stays unset: it only accepts
 * "sneak_peek" or "full". With a real .env.local, nothing is added.
 */
function verifyEnv(root) {
  const env = { ...process.env };
  const example = path.join(root, ".env.example");
  if (existsSync(path.join(root, ".env.local")) || !existsSync(example)) return { env, placeholder: false };
  for (const m of readFileSync(example, "utf8").matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)) {
    const key = m[1] ?? "";
    if (key && key !== "NEXT_PUBLIC_LAUNCH_MODE" && !env[key]) env[key] = "placeholder";
  }
  return { env, placeholder: true };
}

function git(root, args, opts = {}) {
  return spawnSync("git", args, { cwd: root, encoding: opts.encoding ?? "utf8", maxBuffer: 256 * 1024 * 1024, input: opts.input });
}

function readStamp(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeStamp(file, stamp) {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(stamp) + "\n");
  } catch {
    // Not fatal: the next stop just re-verifies.
  }
}

function transcriptEntries(file) {
  if (!file || !existsSync(file)) return [];
  const entries = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip partial lines.
    }
  }
  return entries;
}

function contentBlocks(entry) {
  const c = entry?.message?.content;
  return Array.isArray(c) ? c : typeof c === "string" ? [{ type: "text", text: c }] : [];
}

/** Path relative to the repo root, resolving symlinks (macOS /var -> /private/var). */
function repoRelative(root, file) {
  const abs = path.resolve(root, file);
  let real = abs;
  try {
    real = path.join(realpathSync(path.dirname(abs)), path.basename(abs));
  } catch {
    // Directory gone: compare the path as given.
  }
  return path.relative(realpathSync(root), real).split(path.sep).join("/");
}

/** Has `npm test` run since the last edit to a sensitive file, or does the reply explain why not? */
function testsAccountedFor(input, root) {
  const entries = transcriptEntries(input.transcript_path);
  let lastSensitiveEdit = -1;
  let lastTest = -1;
  let lastText = "";
  let n = 0;
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    for (const b of contentBlocks(entry)) {
      n++;
      if (b.type === "text" && typeof b.text === "string") lastText = b.text;
      if (b.type !== "tool_use") continue;
      const inp = b.input ?? {};
      if (b.name === "Bash" && typeof inp.command === "string") {
        if (TEST_CMD.test(inp.command)) lastTest = n;
        else if (SENSITIVE_IN_COMMAND.test(inp.command) && WRITES.test(inp.command)) lastSensitiveEdit = n;
      } else if (typeof inp.file_path === "string") {
        const rel = repoRelative(root, inp.file_path);
        if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(b.name) && SENSITIVE.some((re) => re.test(rel))) {
          lastSensitiveEdit = n;
        }
      }
    }
  }
  if (lastTest > lastSensitiveEdit) return true;
  const reply = typeof input.last_assistant_message === "string" ? input.last_assistant_message : lastText;
  return MENTIONS_TESTS.test(reply) && NOT_RUN.test(reply) && DB_REASON.test(reply);
}

const input = await readHookInput();
const start = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const top = git(start, ["rev-parse", "--show-toplevel"]);
if (top.status !== 0) process.exit(0);
const root = top.stdout.trim();

const head = git(root, ["rev-parse", "HEAD"]).stdout.trim();
const diff = git(root, ["diff", "HEAD", "--binary", "--", ...DIFF_SCOPE]).stdout;
const changedTracked = git(root, ["diff", "HEAD", "--name-only", "--", ...DIFF_SCOPE]).stdout.split("\n").filter(Boolean);
const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "--", ...CODE_DIRS]).stdout.split("\n").filter(Boolean);

if (!diff && untracked.length === 0) process.exit(0); // clean tree: nothing to verify

const untrackedHashes = untracked.length
  ? git(root, ["hash-object", "--stdin-paths"], { input: untracked.join("\n") + "\n" }).stdout
  : "";
const fingerprint = createHash("sha256").update(`${head}\n${diff}\n${untracked.join("\n")}\n${untrackedHashes}`).digest("hex");

const stampFile = path.join(root, ".claude", ".verify-stamp");
const stamp = readStamp(stampFile);
const problems = [];

if (stamp.pass !== fingerprint) {
  if (input.stop_hook_active && stamp.fail === fingerprint) {
    // Already blocked once on this exact tree and nothing changed: let the
    // turn end instead of looping, but tell the user.
    process.stdout.write(JSON.stringify({ systemMessage: "npm run verify is still failing on this tree (stop hook did not re-run it)." }) + "\n");
    process.exit(0);
  }
  const { env, placeholder } = verifyEnv(root);
  const run = spawnSync("npm", ["run", "verify"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: VERIFY_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status === 0) {
    stamp.pass = fingerprint;
    delete stamp.fail;
  } else {
    stamp.fail = fingerprint;
    const lines = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.split("\n").filter((l) => l.trim());
    const errors = lines.filter((l) => /error|failed|✖|Type error/i.test(l)).slice(0, 25);
    const shown = errors.length ? errors : lines.slice(-25);
    const note = placeholder ? " (no .env.local here, so it ran with placeholder values from .env.example)" : "";
    problems.push(`npm run verify failed${note} (exit ${run.status ?? run.signal}):\n${shown.join("\n")}`);
  }
  writeStamp(stampFile, stamp);
}

const sensitive = [...changedTracked, ...untracked].filter((f) => SENSITIVE.some((re) => re.test(f)));
if (sensitive.length && !testsAccountedFor(input, root)) {
  problems.push(
    `These changes touch checkout/webhook/entitlement/schema code (${sensitive.slice(0, 5).join(", ")}${sensitive.length > 5 ? ", ..." : ""}). ` +
      "Run `npm test` (needs the local Postgres in TEST_DATABASE_URL), or say plainly in your reply why it couldn't run."
  );
}

if (problems.length) block(problems.join("\n\n"));
