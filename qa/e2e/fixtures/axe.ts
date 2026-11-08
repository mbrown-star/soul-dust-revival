import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// axe-core is already a devDependency (added for the one-off manual audit
// documented in ACCESSIBILITY.md's "Automated audit run" section) -- this
// reuses the real engine rather than adding @axe-core/playwright as a new
// dependency, by injecting its built script directly and calling
// `axe.run()` in-page. Playwright's own test transform compiles this file
// to CommonJS, so the ambient `require` (not `import.meta`/`createRequire`,
// which error here with "Cannot use 'import.meta' outside a module") is
// what actually resolves the package path correctly.
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf-8");

export type AxeViolation = {
  id: string;
  impact: "minor" | "moderate" | "serious" | "critical" | null;
  description: string;
  helpUrl: string;
  nodes: { target: string[]; html: string }[];
};

/**
 * Runs axe-core against the current page and returns only "serious"/
 * "critical" violations. "moderate"/"minor" findings exist too (e.g. best-
 * practice landmark-region suggestions) but are noisy enough in a
 * fast-moving admin UI that gating the whole suite on them would train
 * people to ignore failures rather than fix them -- ACCESSIBILITY.md's own
 * manual-verification checklist is where the rest gets covered.
 */
export async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    // @ts-expect-error -- axe is attached to window by the injected script above
    return (await window.axe.run(document, { resultTypes: ["violations"] })) as {
      violations: AxeViolation[];
    };
  });
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

export function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return "";
  return violations
    .map((v) => {
      const targets = v.nodes.map((n) => n.target.join(" ")).join(", ");
      return `[${v.impact}] ${v.id}: ${v.description}\n  nodes: ${targets}\n  ${v.helpUrl}`;
    })
    .join("\n\n");
}
