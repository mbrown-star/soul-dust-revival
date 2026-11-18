#!/usr/bin/env node
// PreToolUse (Edit|Write): files that must never be hand-edited.
//  - soul-dust-interactive/{data,dist}/ and soul-dust-psalms-365/{data,dist}/
//    are generated from the book PDFs, which are the source of truth (see each
//    folder's CLAUDE.md): fix the parser or the PDF, then rebuild.
//  - A top-level design-system/ folder was removed on 2026-11-17; the design
//    system lives in its own repo beside this one
//    (~/Soul Dust Revival Design System).
import path from "node:path";
import { block, existingDir, findUp, readHookInput, toPosix } from "./lib.mjs";

const GENERATED = /(^|\/)(soul-dust-interactive|soul-dust-psalms-365)\/(data|dist)\//;

function check(filePath, cwd) {
  if (!filePath) return null;
  const abs = toPosix(path.resolve(cwd || process.cwd(), filePath));
  const gen = abs.match(GENERATED);
  if (gen) {
    return `Blocked: ${gen[2]}/${gen[3]}/ is generated from the book PDFs (the source of truth). Never hand-edit it; fix the parser in ${gen[2]}/tools/ or the PDF, then run ./build.sh.`;
  }
  // The repo root is the nearest existing ancestor holding .git (a directory
  // in the main checkout, a file in a worktree).
  const root = findUp(existingDir(path.dirname(abs)), ".git");
  if (root) {
    const rel = toPosix(path.relative(root, abs));
    if (rel === "design-system" || rel.startsWith("design-system/")) {
      return "Blocked: there is no design-system/ folder in this repo any more (removed 2026-11-17). The design system lives in ~/Soul Dust Revival Design System, its own repo.";
    }
  }
  return null;
}

const input = await readHookInput();
if (input.tool_name === "Edit" || input.tool_name === "Write" || input.tool_name === "MultiEdit") {
  const reason = check(input.tool_input?.file_path, input.cwd);
  if (reason) block(reason);
}
