#!/usr/bin/env node
// PreToolUse (Bash): CLAUDE.md's shipping and database rules.
//  - Block force pushes (--force, -f, --force-with-lease, +refspec).
//  - Block hand-rolled deploys: `wrangler deploy`, `wrangler versions upload`/
//    `versions deploy`, `opennextjs-cloudflare deploy`/`upload`. Shipping goes
//    through `npm run deploy` (scripts/deploy/deploy.ts), which builds the
//    pushed HEAD cleanly, scans for secrets, checks, then switches traffic.
//  - Ask first for database writes (`npm run db:migrate`, `db:seed`,
//    `drizzle-kit push`/`migrate`) and `wrangler secret`: one database serves
//    staging and production, and secrets are production config.
// `npm run deploy` and ordinary pushes are allowed.
import path from "node:path";
import { ask, block, readHookInput, simpleCommands, unwrapRunner } from "./lib.mjs";

function gitSubcommand(words) {
  // git [-C dir] [-c k=v] [--flags] <sub> args...
  let i = 1;
  while (i < words.length) {
    const w = words[i] ?? "";
    if (w === "-C" || w === "-c" || w === "--git-dir" || w === "--work-tree") i += 2;
    else if (w.startsWith("-")) i++;
    else break;
  }
  return { sub: words[i], args: words.slice(i + 1) };
}

function isForcePush(args) {
  return args.some(
    (a) =>
      a === "--force" ||
      a.startsWith("--force-with-lease") ||
      a === "--force-if-includes" ||
      /^-[A-Za-z]*f[A-Za-z]*$/.test(a) ||
      (/^\+[^\s]/.test(a) && !a.startsWith("+-"))
  );
}

const DB_SCRIPTS = new Set(["db:migrate", "db:seed"]);

function checkCommand(rawWords) {
  const words = unwrapRunner(rawWords);
  const name = path.basename(words[0] ?? "");
  const firstArg = words.slice(1).find((w) => !w.startsWith("-"));

  if (name === "git") {
    const { sub, args } = gitSubcommand(words);
    if (sub === "push" && isForcePush(args)) {
      return { decision: "block", reason: "Blocked: force push. Rewriting pushed history needs the user's explicit go-ahead (CLAUDE.md: ask before force pushes)." };
    }
  }

  if (name === "wrangler") {
    const sub = words.slice(1).filter((w) => !w.startsWith("-"));
    if (sub[0] === "deploy" || sub[0] === "publish" || (sub[0] === "versions" && (sub[1] === "upload" || sub[1] === "deploy"))) {
      return { decision: "block", reason: `Blocked: direct \`wrangler ${sub.slice(0, 2).join(" ")}\`. Ship with \`npm run deploy\` (scripts/deploy/deploy.ts), never a hand-rolled build (CLAUDE.md step 8).` };
    }
    if (sub[0] === "secret" || sub[0] === "secrets") {
      return { decision: "ask", reason: "`wrangler secret` changes Worker secrets (production config). CLAUDE.md: ask before touching Worker secrets." };
    }
  }

  if (name === "opennextjs-cloudflare" && (firstArg === "deploy" || firstArg === "upload")) {
    return { decision: "block", reason: `Blocked: direct \`opennextjs-cloudflare ${firstArg}\`. Ship with \`npm run deploy\` (scripts/deploy/deploy.ts), never a hand-rolled build (CLAUDE.md step 8).` };
  }

  if (name === "drizzle-kit" && (firstArg === "push" || firstArg === "migrate")) {
    return { decision: "ask", reason: `\`drizzle-kit ${firstArg}\` writes to the one database staging and production share. CLAUDE.md: ask before database migrations or data writes.` };
  }

  const runner = path.basename(rawWords[0] ?? "");
  if (runner === "npm" || runner === "pnpm" || runner === "yarn" || runner === "bun") {
    const runIdx = rawWords.findIndex((w) => w === "run" || w === "run-script");
    const script = runIdx >= 0 ? rawWords[runIdx + 1] : runner === "npm" ? undefined : rawWords[1];
    if (script && DB_SCRIPTS.has(script)) {
      return { decision: "ask", reason: `\`npm run ${script}\` writes to the one database staging and production share. CLAUDE.md: ask before database migrations or data writes.` };
    }
  }

  // The scripts behind db:migrate / db:seed, run directly.
  if ((name === "node" || name === "tsx") && words.some((w) => /scripts\/(migrate-direct\.mjs|seed\.ts)$/.test(w))) {
    return { decision: "ask", reason: "This runs the migrate/seed script directly, which writes to the one database staging and production share. CLAUDE.md: ask first." };
  }

  return null;
}

function evaluate(command) {
  let pendingAsk = null;
  for (const words of simpleCommands(command)) {
    const r = checkCommand(words);
    if (r?.decision === "block") return r;
    if (r?.decision === "ask" && !pendingAsk) pendingAsk = r;
  }
  return pendingAsk;
}

const input = await readHookInput();
if (input.tool_name === "Bash") {
  const r = evaluate(String(input.tool_input?.command ?? ""));
  if (r?.decision === "block") block(r.reason);
  if (r?.decision === "ask") ask(r.reason);
}
