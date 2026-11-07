// One-off backfill: gives every devotional lesson's already-imported "A
// Question to Sit With" text a real, saved-per-user answer -- a new
// "question" content_block (reusing the existing QuestionBlock/responses
// plumbing unchanged, the same mechanism Colossians' Work the Word stations
// already use) instead of the plain display-only text DevotionalDayView
// rendered before the Journal/Year rebuild.
//
// The question's text comes from the lesson's own already-stored HTML (via
// parseDevotionalHtml) -- no new source data, no re-import, no risk of
// drifting from what's already displayed on the page.
//
// Idempotent: a lesson that already has a "question" content_block is left
// alone, so re-running this never creates duplicates.
//
// Usage: npx tsx --env-file=.env.local scripts/backfill-devotional-question-blocks.ts
import { getDb } from "../lib/db/client";
import { studies, lessons, contentBlocks } from "../lib/db/schema";
import { eq, and, max } from "drizzle-orm";
import { parseDevotionalHtml } from "../lib/devotional/parseDevotionalHtml";

async function main() {
  const db = await getDb();

  const devotionalStudies = await db.select().from(studies).where(eq(studies.kind, "devotional"));
  if (devotionalStudies.length === 0) {
    console.log("No devotional-kind studies found -- nothing to backfill.");
    process.exit(0);
  }

  let backfilled = 0;
  let skippedAlreadySet = 0;
  let skippedNoQuestion = 0;

  for (const study of devotionalStudies) {
    const studyLessons = await db.select().from(lessons).where(eq(lessons.studyId, study.id));

    for (const lesson of studyLessons) {
      const blocks = await db
        .select()
        .from(contentBlocks)
        .where(eq(contentBlocks.lessonId, lesson.id));

      if (blocks.some((b) => b.type === "question")) {
        skippedAlreadySet++;
        continue;
      }

      const textBlock = blocks.find((b) => b.type === "text");
      const parsed = parseDevotionalHtml(textBlock?.body ?? "");
      const questionText = parsed.questionParagraphs.join(" ").trim();
      if (!questionText) {
        skippedNoQuestion++;
        continue;
      }

      const [maxOrderRow] = await db
        .select({ value: max(contentBlocks.orderIndex) })
        .from(contentBlocks)
        .where(eq(contentBlocks.lessonId, lesson.id));
      const nextOrder = (maxOrderRow?.value ?? -1) + 1;

      await db.insert(contentBlocks).values({
        lessonId: lesson.id,
        orderIndex: nextOrder,
        type: "question",
        questionPrompt: questionText,
      });

      backfilled++;
      console.log(`Backfilled: ${study.title} / ${lesson.title}`);
    }
  }

  console.log(
    `\nDone. Backfilled ${backfilled}, already set ${skippedAlreadySet}, no question text ${skippedNoQuestion}.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
