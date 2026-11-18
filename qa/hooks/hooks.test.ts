// Unit tests for the Claude Code hooks in .claude/hooks/ (wired up in
// .claude/settings.json). Each test pipes a sample hook JSON payload into the
// real script, the same way Claude Code does, and checks the exit code and
// decision. No database needed: run with `npm run test:hooks`.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkBuildSummary } from "../../.claude/hooks/build-summary.mjs";

const REPO = path.resolve(import.meta.dirname, "../..");
const HOOKS = path.join(REPO, ".claude", "hooks");
const PRE_TOOL_USE_BUDGET_MS = 2000;

type Result = { code: number | null; stdout: string; stderr: string; ms: number };
const timings: { hook: string; ms: number }[] = [];
const scratch: string[] = [];

function runHook(hook: string, payload: object, env: Record<string, string> = {}): Result {
  const started = performance.now();
  const r = spawnSync("node", [path.join(HOOKS, hook)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
  const ms = performance.now() - started;
  timings.push({ hook, ms });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, ms };
}

function pre(tool: string, toolInput: object) {
  return { hook_event_name: "PreToolUse", tool_name: tool, tool_input: toolInput, cwd: REPO };
}

function decision(r: Result): "block" | "ask" | "allow" {
  if (r.code === 2) return "block";
  if (r.code === 0 && r.stdout.trim()) {
    const out = JSON.parse(r.stdout) as { hookSpecificOutput?: { permissionDecision?: string } };
    if (out.hookSpecificOutput?.permissionDecision === "ask") return "ask";
  }
  if (r.code === 0) return "allow";
  throw new Error(`unexpected exit ${r.code}: ${r.stderr}`);
}

function tempDir(prefix: string) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

afterAll(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true });
  const byHook = new Map<string, number[]>();
  for (const t of timings) byHook.set(t.hook, [...(byHook.get(t.hook) ?? []), t.ms]);
  const rows = [...byHook].map(([hook, ms]) => `${hook.padEnd(24)} runs ${String(ms.length).padStart(3)}  max ${Math.max(...ms).toFixed(0).padStart(6)} ms`);
  console.log(`hook timings:\n${rows.join("\n")}`);
});

// ---------------------------------------------------------------------------
describe("protect-env-files (PreToolUse Read|Edit|Write|Grep|Bash)", () => {
  const hook = "protect-env-files.mjs";

  it.each([
    ["Read", { file_path: path.join(REPO, ".env.local") }],
    ["Read", { file_path: path.join(REPO, ".env") }],
    ["Read", { file_path: path.join(REPO, ".dev.vars") }],
    ["Read", { file_path: "/Users/someone/Soul Dust Revival/.claude/worktrees/x-123/.env.local" }],
    ["Edit", { file_path: path.join(REPO, ".env.production.local"), old_string: "a", new_string: "b" }],
    ["Write", { file_path: path.join(REPO, ".env.development.local"), content: "X=1" }],
    ["Grep", { pattern: "SECRET", path: path.join(REPO, ".env.local") }],
    ["Grep", { pattern: "SECRET", glob: ".env*" }],
  ])("blocks %s %j", (tool, input) => {
    expect(decision(runHook(hook, pre(tool, input)))).toBe("block");
  });

  it.each([
    ["Read", { file_path: path.join(REPO, ".env.example") }],
    ["Read", { file_path: path.join(REPO, "lib", "env.ts") }],
    ["Edit", { file_path: path.join(REPO, ".gitignore"), old_string: "a", new_string: "b" }],
    ["Grep", { pattern: "DATABASE_URL", path: REPO }],
  ])("allows %s %j", (tool, input) => {
    expect(decision(runHook(hook, pre(tool, input)))).toBe("allow");
  });

  it.each([
    "cat .env.local",
    "grep STRIPE .env",
    "source .env.local",
    ". ./.env.local && node x.js",
    "cp .env.local /tmp/env-copy",
    "printf '%s' \"$(cat .dev.vars)\"",
    "cat .env*",
    "head -5 ../../.env.local",
    "bash -c 'cat .env.local'",
    "npx tsx --env-file=.env.local scripts/x.ts",
    "cd /Users/x/Soul\\ Dust\\ Revival && cat .env.production.local | head",
    "node -e \"console.log(1)\" < .env.local",
  ])("blocks Bash `%s`", (command) => {
    expect(decision(runHook(hook, pre("Bash", { command })))).toBe("block");
  });

  it.each([
    "npm run deploy",
    "npm run deploy -- staging --no-promote",
    "cat .env.example",
    "cp .env.example .env.example.bak",
    "git check-ignore -v .env.local .dev.vars",
    "ls -la .env.local",
    'git commit -m "Ignore .env.local and .claude/settings.local.json"',
    "npm run verify",
  ])("allows Bash `%s`", (command) => {
    expect(decision(runHook(hook, pre("Bash", { command })))).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
describe("guard-bash (PreToolUse Bash)", () => {
  const hook = "guard-bash.mjs";
  const bash = (command: string) => decision(runHook(hook, pre("Bash", { command })));

  it.each([
    "git push -f",
    "git push -f origin main",
    "git push --force origin main",
    "git push --force-with-lease origin main",
    "git push --force-with-lease=main:abc123 origin main",
    "git push origin +main",
    "git -C /tmp/repo push -uf origin main",
    "wrangler deploy",
    "npx wrangler deploy --env production",
    "npx wrangler deploy --dry-run",
    "npx wrangler versions upload --env production",
    "wrangler versions deploy 1234@100%",
    "npx opennextjs-cloudflare deploy",
    "npx opennextjs-cloudflare build && npx opennextjs-cloudflare upload",
    "cd /tmp && CLOUDFLARE_ENV=production npx wrangler deploy",
    "bash -c \"npx wrangler deploy\"",
    "echo ok; $(npx wrangler deploy)",
  ])("blocks `%s`", (command) => {
    expect(bash(command)).toBe("block");
  });

  it.each([
    "npm run db:migrate",
    "npm run db:seed",
    "npx drizzle-kit push",
    "npx drizzle-kit migrate",
    "npx wrangler secret put STRIPE_SECRET_KEY --env production",
    "echo value | wrangler secret put FOO",
    "node scripts/migrate-direct.mjs",
  ])("asks for `%s`", (command) => {
    expect(bash(command)).toBe("ask");
  });

  it.each([
    "git push origin main",
    "git push origin HEAD:main",
    "git push -u origin claude/feature",
    "npm run deploy",
    "npm run deploy -- staging --no-promote",
    "npm run deploy -- --yes",
    "npx wrangler deployments list",
    "npx wrangler deployments list --env production",
    "npm run db:generate",
    "npm run verify && npm test",
    'git commit -m "Never run wrangler deploy or git push --force by hand"',
    "git commit -F - <<'EOF'\nUse npm run deploy, never wrangler deploy.\nEOF",
    "echo wrangler deploy",
  ])("allows `%s`", (command) => {
    expect(bash(command)).toBe("allow");
  });

  it("does not ask or block other tools", () => {
    expect(decision(runHook(hook, pre("Read", { file_path: "wrangler deploy" })))).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
describe("protect-generated (PreToolUse Edit|Write)", () => {
  const hook = "protect-generated.mjs";

  it.each([
    ["Edit", "soul-dust-interactive/dist/colossians.html"],
    ["Edit", "soul-dust-interactive/dist/artifact/psalms-365.html"],
    ["Write", "soul-dust-interactive/data/colossians-weeks.json"],
    ["Edit", "soul-dust-interactive/data/weeks/james.json"],
    ["Write", "soul-dust-psalms-365/data/days.json"],
    ["Write", "soul-dust-psalms-365/dist/index.html"],
    ["Write", "design-system/README.md"],
    ["Write", "design-system/tokens/colors.json"],
    ["Edit", "/Users/someone/Soul Dust Revival/soul-dust-interactive/dist/colossians.html"],
  ])("blocks %s %s", (tool, file) => {
    const r = runHook(hook, pre(tool, { file_path: path.isAbsolute(file) ? file : path.join(REPO, file) }));
    expect(decision(r)).toBe("block");
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
  });

  it.each([
    ["Edit", "soul-dust-interactive/tools/study/parse_study.py"],
    ["Edit", "soul-dust-interactive/source/notes.md"],
    ["Edit", "soul-dust-psalms-365/tools/build.py"],
    ["Write", "lib/entitlements/check.ts"],
    ["Write", "docs/design-system-notes.md"],
    ["Write", "components/design-system/Button.tsx"],
  ])("allows %s %s", (tool, file) => {
    expect(decision(runHook(hook, pre(tool, { file_path: path.join(REPO, file) })))).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
describe("build-interactive (PostToolUse Edit|Write on soul-dust-interactive/tools/**)", () => {
  const hook = "build-interactive.mjs";
  const weeks = (override = "") =>
    Array.from({ length: 12 }, (_, i) =>
      i === 4 && override
        ? override
        : `Week ${String(i + 1).padStart(2)}: Title | Col 1:${i + 1} | sections 2, parts 4, stations 5, practices 5, benediction ¶ 3`
    ).join("\n");
  const GOOD = `== Colossians (12-week study) ==\n${weeks()}\nWrote dist/colossians.html: 12 weeks, 300 KB\n== Psalms (365-day devotional) ==\n365 days parsed\nparagraphs per day: {4: 365}\ndays missing a part: none\nDone.`;

  it("accepts a correct build summary", () => {
    expect(checkBuildSummary(GOOD)).toEqual([]);
  });

  it.each([
    ["a week with 4 stations", GOOD.replace(weeks(), weeks("Week  5: Title | Col 2:1 | sections 2, parts 4, stations 4, practices 5, benediction ¶ 3")), /Week  5.*expected stations 5/],
    ["364 days", GOOD.replace("365 days parsed", "364 days parsed"), /364 days parsed.*expected 365/],
    ["uneven paragraphs", GOOD.replace("{4: 365}", "{4: 363, 3: 2}"), /paragraphs per day.*expected \{4: 365\}/],
    ["missing parts", GOOD.replace("days missing a part: none", "days missing a part: [12, 200]"), /\[12, 200\].*expected none/],
    ["no week lines", GOOD.replace(weeks(), ""), /no study week summary lines/],
  ])("flags %s", (_name, output, pattern) => {
    expect(checkBuildSummary(output).join("\n")).toMatch(pattern);
  });

  // A fake soul-dust-interactive folder with its own build.sh, and a fake
  // python3 on PATH, so the hook's real process logic runs without the PDFs.
  function fakeProject(buildOutput: string, buildExit: number, hasPdfplumber: boolean) {
    const root = tempDir("sdr-hook-build-");
    const proj = path.join(root, "soul-dust-interactive");
    const bin = path.join(root, "bin");
    mkdirSync(path.join(proj, "tools", "study"), { recursive: true });
    mkdirSync(bin);
    writeFileSync(path.join(proj, "summary.txt"), buildOutput);
    writeFileSync(path.join(proj, "build.sh"), `#!/bin/sh\ncat summary.txt\nexit ${buildExit}\n`);
    chmodSync(path.join(proj, "build.sh"), 0o755);
    writeFileSync(path.join(bin, "python3"), `#!/bin/sh\nexit ${hasPdfplumber ? 0 : 1}\n`);
    chmodSync(path.join(bin, "python3"), 0o755);
    const payload = {
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: path.join(proj, "tools", "study", "parse_study.py") },
      cwd: root,
    };
    return { payload, env: { PATH: `${bin}:${process.env.PATH ?? ""}` } };
  }

  it("passes when every summary line is right", () => {
    const { payload, env } = fakeProject(GOOD, 0, true);
    expect(decision(runHook(hook, payload, env))).toBe("allow");
  });

  it("blocks and feeds back the failing line", () => {
    const { payload, env } = fakeProject(GOOD.replace("365 days parsed", "360 days parsed"), 0, true);
    const r = runHook(hook, payload, env);
    expect(decision(r)).toBe("block");
    expect(r.stderr).toContain("360 days parsed");
  });

  it("blocks when build.sh itself fails", () => {
    const { payload, env } = fakeProject("Traceback: boom", 1, true);
    const r = runHook(hook, payload, env);
    expect(decision(r)).toBe("block");
    expect(r.stderr).toContain("Traceback: boom");
  });

  it("says so when pdfplumber is missing, instead of passing", () => {
    const { payload, env } = fakeProject(GOOD, 0, false);
    const r = runHook(hook, payload, env);
    expect(decision(r)).toBe("block");
    expect(r.stderr).toMatch(/pdfplumber is not installed/);
  });

  it("ignores edits outside soul-dust-interactive/tools/", () => {
    const r = runHook(hook, { hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: path.join(REPO, "lib", "env.ts") }, cwd: REPO });
    expect(decision(r)).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
describe("lint-file (PostToolUse Edit|Write on *.ts/*.tsx/*.mjs)", () => {
  const hook = "lint-file.mjs";
  const dir = path.join(REPO, "qa", "hooks", "__scratch__");
  const post = (file: string) => ({ hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: file }, cwd: REPO });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("feeds back ESLint errors for that file", () => {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `bad-${process.pid}.ts`);
    // @next/next/no-assign-module-variable is an error-level rule here.
    writeFileSync(file, "const module = { a: 1 };\nexport default module;\n");
    const r = runHook(hook, post(file));
    expect(decision(r)).toBe("block");
    expect(r.stderr).toContain("no-assign-module-variable");
  });

  it("passes a clean file", () => {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `good-${process.pid}.ts`);
    writeFileSync(file, "export const answer = 42;\n");
    expect(decision(runHook(hook, post(file)))).toBe("allow");
  });

  it("skips other file types and files outside a repo", () => {
    expect(decision(runHook(hook, post(path.join(REPO, "README.md"))))).toBe("allow");
    const outside = path.join(tempDir("sdr-hook-lint-"), "x.ts");
    writeFileSync(outside, "const module = 1;\n");
    expect(decision(runHook(hook, post(outside)))).toBe("allow");
  });
});

// ---------------------------------------------------------------------------
describe("stop-verify (Stop)", () => {
  const hook = "stop-verify.mjs";

  // A throwaway git repo whose `npm run verify` logs each run and passes or
  // fails depending on whether lib/broken exists.
  function fakeRepo() {
    const root = tempDir("sdr-hook-stop-");
    const git = (...args: string[]) => {
      const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
      if (r.status !== 0) throw new Error(r.stderr);
    };
    git("init", "-q");
    git("config", "user.email", "hooks@example.test");
    git("config", "user.name", "hooks test");
    const verify =
      "node -e \"require('fs').appendFileSync('verify-ran.log','x'); if (require('fs').existsSync('lib/broken')) { console.error('Type error: lib/broken'); process.exit(1) }\"";
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fake", private: true, scripts: { verify } }));
    writeFileSync(path.join(root, ".gitignore"), "verify-ran.log\n.claude/.verify-stamp\n");
    mkdirSync(path.join(root, "lib"));
    writeFileSync(path.join(root, "lib", "a.ts"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-q", "-m", "init");
    const runs = () => (existsSync(path.join(root, "verify-ran.log")) ? readFileSync(path.join(root, "verify-ran.log"), "utf8").length : 0);
    const transcript = path.join(root, "transcript.jsonl");
    writeFileSync(transcript, "");
    const stop = (extra: object = {}) =>
      runHook(hook, { hook_event_name: "Stop", stop_hook_active: false, cwd: root, transcript_path: transcript, ...extra }, { CLAUDE_PROJECT_DIR: root });
    return { root, runs, stop, transcript };
  }

  it("does nothing on a clean tree (verify not run)", () => {
    const { runs, stop } = fakeRepo();
    expect(decision(stop())).toBe("allow");
    expect(runs()).toBe(0);
  });

  it("verifies changed code once, then caches the passing tree", () => {
    const { root, runs, stop } = fakeRepo();
    writeFileSync(path.join(root, "lib", "a.ts"), "export const a = 2;\n");
    expect(decision(stop())).toBe("allow");
    expect(runs()).toBe(1);
    expect(decision(stop())).toBe("allow");
    expect(runs()).toBe(1); // unchanged tree: not re-verified
    writeFileSync(path.join(root, "lib", "new.ts"), "export const b = 1;\n"); // untracked under lib/
    expect(decision(stop())).toBe("allow");
    expect(runs()).toBe(2);
  });

  it("ignores Markdown-only changes", () => {
    const { root, runs, stop } = fakeRepo();
    writeFileSync(path.join(root, "NOTES.md"), "x\n");
    spawnSync("git", ["add", "NOTES.md"], { cwd: root });
    expect(decision(stop())).toBe("allow");
    expect(runs()).toBe(0);
  });

  it("blocks on a failing verify, and does not loop on the same tree", () => {
    const { root, runs, stop } = fakeRepo();
    writeFileSync(path.join(root, "lib", "broken"), "");
    const r = stop();
    expect(decision(r)).toBe("block");
    expect(r.stderr).toContain("npm run verify failed");
    expect(r.stderr).toContain("Type error: lib/broken");
    const again = stop({ stop_hook_active: true });
    expect(decision(again)).toBe("allow");
    expect(again.stdout).toContain("still failing");
    expect(runs()).toBe(1);
  });

  it("fills unset .env.example keys with placeholders when there is no .env.local", () => {
    const { root, stop } = fakeRepo();
    writeFileSync(path.join(root, ".env.example"), "STRIPE_SECRET_KEY=\nNEXT_PUBLIC_LAUNCH_MODE=\n");
    const verify =
      "node -e \"const e=process.env; if (e.STRIPE_SECRET_KEY!=='placeholder' || e.NEXT_PUBLIC_LAUNCH_MODE) { console.error('Type error: env', e.STRIPE_SECRET_KEY, e.NEXT_PUBLIC_LAUNCH_MODE); process.exit(1) }\"";
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "fake", private: true, scripts: { verify } }));
    const r = stop();
    expect(r.stderr).toBe("");
    expect(decision(r)).toBe("allow");
  });

  describe("sensitive paths need npm test", () => {
    function withEntitlementChange() {
      const repo = fakeRepo();
      mkdirSync(path.join(repo.root, "lib", "entitlements"));
      writeFileSync(path.join(repo.root, "lib", "entitlements", "check.ts"), "export const ok = true;\n");
      return repo;
    }
    const line = (blocks: object[]) => JSON.stringify({ type: "assistant", message: { content: blocks } });
    const editCheck = (root: string) => ({ type: "tool_use", name: "Write", input: { file_path: path.join(root, "lib", "entitlements", "check.ts") } });

    it("blocks when tests did not run", () => {
      const { root, stop, transcript } = withEntitlementChange();
      writeFileSync(transcript, line([editCheck(root)]) + "\n" + line([{ type: "text", text: "Done." }]) + "\n");
      const r = stop();
      expect(decision(r)).toBe("block");
      expect(r.stderr).toContain("npm test");
    });

    it("allows once npm test ran after the edit", () => {
      const { root, stop, transcript } = withEntitlementChange();
      writeFileSync(transcript, [line([editCheck(root)]), line([{ type: "tool_use", name: "Bash", input: { command: "npm test" } }])].join("\n") + "\n");
      expect(decision(stop())).toBe("allow");
    });

    it("still blocks when npm test ran before the last edit", () => {
      const { root, stop, transcript } = withEntitlementChange();
      writeFileSync(transcript, [line([{ type: "tool_use", name: "Bash", input: { command: "npm test" } }]), line([editCheck(root)])].join("\n") + "\n");
      expect(decision(stop())).toBe("block");
    });

    it("allows when the reply says plainly why tests couldn't run", () => {
      const { root, stop, transcript } = withEntitlementChange();
      writeFileSync(transcript, line([editCheck(root)]) + "\n");
      const r = stop({ last_assistant_message: "I couldn't run npm test: there is no local Postgres (TEST_DATABASE_URL is unset) in this worktree." });
      expect(decision(r)).toBe("allow");
    });
  });
});

// ---------------------------------------------------------------------------
describe("timing", () => {
  it(`keeps every PreToolUse hook under ${PRE_TOOL_USE_BUDGET_MS} ms`, () => {
    const preHooks = new Set(["protect-env-files.mjs", "guard-bash.mjs", "protect-generated.mjs"]);
    const slow = timings.filter((t) => preHooks.has(t.hook) && t.ms > PRE_TOOL_USE_BUDGET_MS);
    expect(slow).toEqual([]);
  });
});
