// Shared helpers for this repo's Claude Code hooks (.claude/settings.json).
// Plain Node, no dependencies. Every hook reads one JSON object on stdin and
// either exits 0 (allow), exits 2 with a one-line reason on stderr (block), or
// prints a hookSpecificOutput JSON object (ask).
import { existsSync, statSync } from "node:fs";
import path from "node:path";

export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

export function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

export function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: reason,
      },
    }) + "\n"
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Shell parsing. Not a full shell parser: it is enough to find the command
// word of each simple command, keep quoted strings as single tokens (so a
// commit message that mentions "wrangler deploy" is not a deploy), and look
// inside `$(...)`, backticks, `bash -c "..."` and heredocs fed to a shell.
// ---------------------------------------------------------------------------

const OPERATORS = ["&&", "||", ";;", "|&", ";", "|", "&", "\n", "(", ")"];

/**
 * Remove heredoc bodies. A body fed to a shell (`bash <<EOF`) is returned in
 * `shellBodies` so it can be analysed as commands; any other body (a commit
 * message, a file being written with cat) is data and is dropped.
 */
export function stripHeredocs(command) {
  const lines = command.split("\n");
  const out = [];
  const shellBodies = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    out.push(line);
    const re = /<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/g;
    let m;
    const delims = [];
    while ((m = re.exec(line)) !== null) delims.push({ dash: m[1] === "-", tag: m[3] ?? "" });
    if (delims.length === 0) continue;
    const firstWord = (line.trim().split(/\s+/)[0] ?? "").replace(/^.*\//, "");
    const feedsShell = ["bash", "sh", "zsh", "dash", "eval"].includes(firstWord);
    for (const d of delims) {
      const body = [];
      i++;
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if ((d.dash ? l.replace(/^\t+/, "") : l) === d.tag) break;
        body.push(l);
        i++;
      }
      if (feedsShell) shellBodies.push(body.join("\n"));
    }
  }
  return { text: out.join("\n"), shellBodies };
}

/** Split a command string into simple commands, each a list of words. */
export function tokenize(command) {
  const commands = [];
  const nested = [];
  let words = [];
  let word = "";
  let inWord = false;
  const pushWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const pushCommand = () => {
    pushWord();
    if (words.length) commands.push(words);
    words = [];
  };
  const s = command;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) {
      if (s[i + 1] !== "\n") {
        word += s[i + 1];
        inWord = true;
      }
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      const stop = end === -1 ? s.length : end;
      word += s.slice(i + 1, stop);
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\" && j + 1 < s.length) {
          buf += s[j + 1];
          j += 2;
          continue;
        }
        buf += s[j];
        j++;
      }
      collectSubstitutions(buf, nested);
      word += buf;
      inWord = true;
      i = j + 1;
      continue;
    }
    if (c === "$" && s[i + 1] === "(") {
      const end = matchParen(s, i + 1);
      nested.push(s.slice(i + 2, end));
      word += s.slice(i, end + 1);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      const stop = end === -1 ? s.length : end;
      nested.push(s.slice(i + 1, stop));
      word += s.slice(i, stop + 1);
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (c === "#" && !inWord) {
      const nl = s.indexOf("\n", i);
      i = nl === -1 ? s.length : nl;
      continue;
    }
    const op = OPERATORS.find((o) => s.startsWith(o, i));
    if (op) {
      pushCommand();
      i += op.length;
      continue;
    }
    if (c === " " || c === "\t") {
      pushWord();
      i++;
      continue;
    }
    word += c;
    inWord = true;
    i++;
  }
  pushCommand();
  return { commands, nested };
}

function matchParen(s, open) {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "(") depth++;
    else if (s[j] === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return s.length;
}

function collectSubstitutions(text, nested) {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i + 1] === "(") {
      const end = matchParen(text, i + 1);
      nested.push(text.slice(i + 2, end));
      i = end;
    } else if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      const stop = end === -1 ? text.length : end;
      nested.push(text.slice(i + 1, stop));
      i = stop;
    }
  }
}

const WRAPPERS = new Set(["sudo", "env", "command", "exec", "time", "nohup", "xargs", "nice"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash"]);

/**
 * Every simple command in `command`, recursively including `$(...)`,
 * backticks, `bash -c "..."`, `eval "..."` and heredocs fed to a shell. Each
 * entry is the word list starting at the real command word (leading
 * `VAR=value` assignments and wrappers such as `env`/`sudo` removed).
 */
export function simpleCommands(command, depth = 0) {
  if (depth > 4) return [];
  const { text, shellBodies } = stripHeredocs(command);
  const { commands, nested } = tokenize(text);
  const result = [];
  for (const words of commands) {
    let k = 0;
    while (k < words.length) {
      const w = words[k] ?? "";
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) k++;
      else if (WRAPPERS.has(path.basename(w))) k++;
      else if (k > 0 && WRAPPERS.has(path.basename(words[k - 1] ?? "")) && w.startsWith("-")) k++;
      else break;
    }
    const rest = words.slice(k);
    if (!rest.length) continue;
    result.push(rest);
    const name = path.basename(rest[0] ?? "");
    if (SHELLS.has(name)) {
      const ci = rest.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w));
      const script = ci >= 0 ? rest[ci + 1] : undefined;
      if (script) result.push(...simpleCommands(script, depth + 1));
    }
    if (name === "eval") result.push(...simpleCommands(rest.slice(1).join(" "), depth + 1));
  }
  for (const n of [...nested, ...shellBodies]) result.push(...simpleCommands(n, depth + 1));
  return result;
}

/**
 * The words after the package runner when a command is run through npx,
 * `npm exec`, pnpm/yarn/bun, e.g. `npx wrangler deploy` -> [wrangler, deploy].
 * Anything else is returned unchanged.
 */
export function unwrapRunner(words) {
  const name = path.basename(words[0] ?? "");
  let rest = null;
  if (name === "npx" || name === "bunx") rest = words.slice(1);
  else if (name === "npm" && (words[1] === "exec" || words[1] === "x")) rest = words.slice(2);
  else if (name === "pnpm" && (words[1] === "exec" || words[1] === "dlx")) rest = words.slice(2);
  else if (name === "pnpm" || name === "yarn") rest = words.slice(1);
  else if (name === "bun" && words[1] === "x") rest = words.slice(2);
  if (!rest) return words;
  while (rest.length && (rest[0] ?? "").startsWith("-")) {
    const flag = rest.shift() ?? "";
    if ((flag === "-p" || flag === "--package") && rest.length) rest.shift();
  }
  return rest;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Nearest ancestor of `start` (or itself) that contains `marker`. */
export function findUp(start, marker) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Nearest existing directory at or above `p` (the file may not exist yet). */
export function existingDir(p) {
  let dir = path.resolve(p);
  while (!existsSync(dir) || !statSync(dir).isDirectory()) {
    const parent = path.dirname(dir);
    if (parent === dir) return dir;
    dir = parent;
  }
  return dir;
}

export function toPosix(p) {
  return p.split(path.sep).join("/");
}
