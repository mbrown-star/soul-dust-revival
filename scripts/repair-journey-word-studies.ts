/**
 * Moves each Journey week's Life Application (and any Movement or Part
 * closing) out of its last word-study callout into its own text block right
 * after it -- the four Journey Parts were imported before the parser ended a
 * word study at its "LIVE IT" line. See lib/import/splitWordStudyCallout.ts.
 *
 * Keeps every existing block id (readers' saved answers point at them), one
 * transaction per callout, and skips any lesson with a published snapshot.
 * Re-running is safe: a repaired callout no longer matches.
 * Dry run by default; pass --apply to write.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/repair-journey-word-studies.ts [--apply]
 */
import { getDb } from "../lib/db/client";
import { applyWordStudyRepair, planWordStudyRepairs } from "../lib/import/repairWordStudyCallouts";

const JOURNEY_PARTS = "soul-dust-revival-part-%";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  const plan = await planWordStudyRepairs(db, JOURNEY_PARTS);

  for (const r of plan) {
    const what = r.skipped
      ? `SKIP (${r.skipped})`
      : `callout ${r.calloutChars[0]} -> ${r.calloutChars[1]} chars, ${r.movedChars} chars to a new text block`;
    console.log(`  ${r.studySlug.replace(/^soul-dust-revival-/, "")} :: ${r.lessonTitle} :: ${what}`);
  }
  const todo = plan.filter((r) => !r.skipped);
  console.log(`\n${plan.length} callouts found, ${todo.length} to repair, ${plan.length - todo.length} skipped.`);

  if (!apply) {
    console.log("Dry run: nothing written. Pass --apply to repair.");
    return;
  }
  let done = 0;
  for (const r of todo) if (await applyWordStudyRepair(db, r)) done++;
  console.log(`Repaired ${done} of ${todo.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
