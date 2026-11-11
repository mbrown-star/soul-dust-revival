/**
 * Repairs the four Journey Parts' introductions: Foreword/Preface become
 * sections (so the threshold shows them as tabs), run-together headings get
 * their words back, and page-furniture lines are dropped. See
 * lib/import/journeyIntroHeadings.ts.
 *
 * The introductions are published, so each goes through the builder's own
 * draft-and-publish steps in one transaction: freeze what readers see,
 * change the working copy, publish it. Refuses everything if any
 * introduction has a heading the repair doesn't know.
 * Dry run by default; pass --apply to write.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/repair-journey-introductions.ts [--apply]
 */
import { and, asc, eq, isNull, like } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { contentBlocks, lessons, studies } from "../lib/db/schema";
import { ensureSnapshot, publishChanges } from "../lib/lessons/publishedContent";
import { repairJourneyIntroHtml } from "../lib/import/journeyIntroHeadings";
import { sanitizeHtml } from "../lib/sanitize/html";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await getDb();
  const intros = await db
    .select({ lessonId: lessons.id, slug: studies.slug, published: lessons.published })
    .from(lessons)
    .innerJoin(studies, eq(studies.id, lessons.studyId))
    .where(and(like(studies.slug, "soul-dust-revival-part-%"), eq(lessons.orderIndex, 0)))
    .orderBy(asc(studies.slug));

  const plan: { lessonId: string; blockId: string; html: string; published: boolean }[] = [];
  let refused = false;
  for (const intro of intros) {
    const textBlocks = await db
      .select({ id: contentBlocks.id, body: contentBlocks.body })
      .from(contentBlocks)
      .where(and(eq(contentBlocks.lessonId, intro.lessonId), eq(contentBlocks.type, "text"), isNull(contentBlocks.removedAt)));
    if (textBlocks.length !== 1) {
      console.log(`  ${intro.slug}: expected one text block, found ${textBlocks.length}; skipping`);
      continue;
    }
    const repair = repairJourneyIntroHtml(textBlocks[0]!.body ?? "");
    if (!repair) {
      console.log(`  ${intro.slug}: already repaired (or not the imported shape); skipping`);
      continue;
    }
    if (repair.unknown.length > 0) {
      refused = true;
      console.log(`  ${intro.slug}: UNKNOWN headings ${repair.unknown.join(", ")}`);
      continue;
    }
    const outline = [...repair.html.matchAll(/<(h[234])>(.*?)<\/\1>/g)].map((m) => `${m[1]} ${m[2]}`);
    console.log(`  ${intro.slug}:\n      ${outline.join("\n      ")}`);
    plan.push({ lessonId: intro.lessonId, blockId: textBlocks[0]!.id, html: repair.html, published: intro.published });
  }

  if (refused) throw new Error("Unknown headings: nothing written. Add them to lib/import/journeyIntroHeadings.ts first.");
  console.log(`\n${plan.length} introductions to repair.`);
  if (!apply) return console.log("Dry run: nothing written. Pass --apply to repair.");

  for (const item of plan) {
    await db.transaction(async (tx) => {
      await ensureSnapshot(tx, item.lessonId);
      await tx.update(contentBlocks).set({ body: sanitizeHtml(item.html) }).where(eq(contentBlocks.id, item.blockId));
      if (item.published) await publishChanges(tx, item.lessonId);
    });
  }
  console.log(`Repaired and published ${plan.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
