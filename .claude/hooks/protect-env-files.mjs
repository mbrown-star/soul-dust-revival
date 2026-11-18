#!/usr/bin/env node
// PreToolUse (Read|Edit|Write|Grep|Bash): keep local secret files out of the
// conversation. Blocks .env, .env.local, .env.*.local and .dev.vars anywhere
// (this checkout, the main checkout, any .claude/worktrees/*). .env.example
// holds placeholders only and stays readable. `npm run deploy` is unaffected:
// it never names these files, and scripts/deploy/deploy.ts writes its own
// placeholder env in a clean worktree.
import path from "node:path";
import { block, readHookInput, simpleCommands } from "./lib.mjs";

// Names the deny rule covers, used to test glob patterns such as `.env*`.
const SAMPLE_NAMES = [
  ".env",
  ".env.local",
  ".env.development.local",
  ".env.production.local",
  ".env.test.local",
  ".dev.vars",
];

function isProtectedName(base) {
  return (
    base === ".env" ||
    base === ".env.local" ||
    base === ".dev.vars" ||
    /^\.env\..+\.local$/.test(base)
  );
}

function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] ?? "";
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[") {
      const end = glob.indexOf("]", i);
      if (end === -1) re += "\\[";
      else {
        re += `[${glob.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
        i = end;
      }
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) re += "\\{";
      else {
        re += `(${glob
          .slice(i + 1, end)
          .split(",")
          .map((p) => p.replace(/[.+^$()|\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, "."))
          .join("|")})`;
        i = end;
      }
    } else re += c.replace(/[.+^$()|\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** True when a path or glob word could name a protected file. */
function referencesSecretFile(word) {
  if (!word) return false;
  const candidates = [word];
  // --env-file=.env.local, KEY=path
  const eq = word.lastIndexOf("=");
  if (eq !== -1) candidates.push(word.slice(eq + 1));
  return candidates.some((raw) => {
    const cleaned = raw.replace(/^\d*[<>]+&?/, "").replace(/\/+$/, "");
    const base = cleaned.split("/").pop() ?? "";
    if (!base) return false;
    if (isProtectedName(base)) return true;
    if (/[*?[{]/.test(base)) {
      const re = globToRegExp(base);
      return SAMPLE_NAMES.some((n) => re.test(n));
    }
    return false;
  });
}

// Commands that may name a secret file without reading or copying it.
function isHarmlessReference(words) {
  const name = path.basename(words[0] ?? "");
  if (["ls", "test", "[", "[[", "stat"].includes(name)) return true;
  if (name === "git" && ["check-ignore", "status"].includes(words.find((w, i) => i > 0 && !w.startsWith("-")) ?? "")) {
    return true;
  }
  return false;
}

function checkBashCommand(command) {
  for (const words of simpleCommands(command)) {
    const hit = words.find((w) => referencesSecretFile(w));
    if (hit && !isHarmlessReference(words)) {
      return `Blocked: this command touches a local secret file (${hit}). .env, .env.local, .env.*.local and .dev.vars stay out of the conversation; use .env.example for variable names.`;
    }
  }
  return null;
}

function checkToolInput(toolName, input) {
  if (toolName === "Bash") return checkBashCommand(String(input?.command ?? ""));
  const fields = [input?.file_path, input?.path, input?.notebook_path];
  if (toolName === "Grep") fields.push(input?.glob);
  for (const f of fields) {
    if (typeof f === "string" && referencesSecretFile(f)) {
      return `Blocked: ${toolName} on ${path.basename(f)} — local secret files (.env, .env.local, .env.*.local, .dev.vars) stay out of the conversation. Use .env.example for variable names.`;
    }
  }
  return null;
}

const input = await readHookInput();
const reason = checkToolInput(input.tool_name, input.tool_input ?? {});
if (reason) block(reason);
