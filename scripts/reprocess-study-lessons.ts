/**
 * One-off maintenance script: re-runs the PDF-to-lessons parser against a
 * study's already-stored source PDF (studies.sourceFileUrl) and overwrites
 * each existing lesson's text content block with the freshly-parsed body —
 * without re-uploading, re-importing, or touching lesson titles/publish
 * state. Written for the 2026-11-09 PDF-formatting fix (stray page-number
 * markers, running headers/footers, and the whole section collapsing into
 * one giant paragraph) so an already-imported-and-published study didn't
 * need to be deleted and re-bought to get the fix.
 *
 * Usage: npx tsx --env-file=.env.local scripts/reprocess-study-lessons.ts <studyId>
 */
import { getDb } from "../lib/db/client";
import { studies, lessons, contentBlocks } from "../lib/db/schema";
import { eq, asc, and } from "drizzle-orm";
import { parsePdfToText } from "../lib/import/parsePdf";
import { splitPlainTextByHeadings } from "../lib/import/splitIntoLessons";
import { sanitizeHtml } from "../lib/sanitize/html";

async function main() {
  const studyId = process.argv[2];
  if (!studyId) {
    console.error("Usage: tsx scripts/reprocess-study-lessons.ts <studyId>");
    process.exit(1);
  }

  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.id, studyId) });
  if (!study) throw new Error(`No study found with id ${studyId}`);
  if (!study.sourceFileUrl) throw new Error(`Study ${studyId} has no stored sourceFileUrl to re-parse from.`);
  if (!study.sourceFileUrl.toLowerCase().endsWith(".pdf")) {
    throw new Error("This script only re-parses PDF sources (splitPlainTextByHeadings); the study's source isn't a .pdf.");
  }

  console.log(`Fetching source PDF from ${study.sourceFileUrl} ...`);
  const res = await fetch(study.sourceFileUrl);
  if (!res.ok) throw new Error(`Failed to fetch source PDF: ${res.status} ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  console.log("Re-parsing with the fixed heuristic...");
  const text = await parsePdfToText(buffer);
  const reparsed = splitPlainTextByHeadings(text);
  console.log(`Re-parse produced ${reparsed.length} sections.`);

  const existingLessons = await db
    .select()
    .from(lessons)
    .where(eq(lessons.studyId, studyId))
    .orderBy(asc(lessons.orderIndex));
  console.log(`Study has ${existingLessons.length} existing lessons.`);

  // Match by exact title first (most robust against the lessons having been
  // reordered since import); fall back to position only when every existing
  // lesson's position and the re-parsed array agree on length, so a
  // mismatch doesn't silently pair up the wrong rows.
  const reparsedByTitle = new Map(reparsed.map((l) => [l.title.trim(), l]));
  const canFallBackToPosition = existingLessons.length === reparsed.length;

  let updated = 0;
  let unmatched = 0;

  for (let i = 0; i < existingLessons.length; i++) {
    const lesson = existingLessons[i]!;
    const match = reparsedByTitle.get(lesson.title.trim()) ?? (canFallBackToPosition ? reparsed[i] : undefined);

    if (!match) {
      console.warn(`  No re-parsed match for existing lesson "${lesson.title}" (${lesson.id}) — left unchanged.`);
      unmatched++;
      continue;
    }

    const result = await db
      .update(contentBlocks)
      .set({ body: sanitizeHtml(match.bodyHtml) })
      .where(and(eq(contentBlocks.lessonId, lesson.id), eq(contentBlocks.type, "text")))
      .returning({ id: contentBlocks.id });

    if (result.length === 0) {
      console.warn(`  Lesson "${lesson.title}" (${lesson.id}) has no 'text' content block to update.`);
      unmatched++;
      continue;
    }
    updated++;
  }

  console.log(`\nDone: ${updated} lesson(s) updated, ${unmatched} left unchanged.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
