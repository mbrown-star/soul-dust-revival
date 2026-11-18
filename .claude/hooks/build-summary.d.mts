// Types for build-summary.mjs, imported by qa/hooks/hooks.test.ts.
/** Returns the build.sh summary lines that fail the rules (empty when the build is good). */
export function checkBuildSummary(output: string): string[];
