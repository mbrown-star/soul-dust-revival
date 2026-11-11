import { and, asc, eq, gt, inArray, like, sql } from "drizzle-orm";
import { contentBlocks, lessons, studies } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { sanitizeHtml } from "@/lib/sanitize/html";
import { splitWordStudyCallout } from "./splitWordStudyCallout";

type Db = Awaited<ReturnType<typeof getDb>>;

export type CalloutRepair = {
  blockId: string;
  lessonId: string;
  studySlug: string;
  lessonTitle: string;
  orderIndex: number;
  calloutChars: [before: number, after: number];
  movedChars: number;
  /** Why it was left alone, if it was. */
  skipped?: string;
};

/**
 * Finds word-study callouts in studies whose slug matches `studySlugLike`
 * that still hold the week's Life Application (see splitWordStudyCallout),
 * and plans each repair. Read-only.
 */
export async function planWordStudyRepairs(db: Db, studySlugLike: string): Promise<CalloutRepair[]> {
  const rows = await db
    .select({
      blockId: contentBlocks.id,
      lessonId: lessons.id,
      studySlug: studies.slug,
      lessonTitle: lessons.title,
      orderIndex: contentBlocks.orderIndex,
      body: contentBlocks.body,
      publishedContent: lessons.publishedContent,
    })
    .from(contentBlocks)
    .innerJoin(lessons, eq(lessons.id, contentBlocks.lessonId))
    .innerJoin(studies, eq(studies.id, lessons.studyId))
    .where(
      and(
        like(studies.slug, studySlugLike),
        eq(contentBlocks.type, "callout"),
        sql`${contentBlocks.removedAt} is null`,
        sql`${contentBlocks.body} ~ 'LIFE ?APPLICATION'`
      )
    )
    .orderBy(asc(studies.slug), asc(lessons.orderIndex));

  return rows.map((row) => {
    const base = {
      blockId: row.blockId,
      lessonId: row.lessonId,
      studySlug: row.studySlug,
      lessonTitle: row.lessonTitle,
      orderIndex: row.orderIndex,
    };
    const body = row.body ?? "";
    // A published snapshot would keep showing readers the old callout; such
    // a lesson needs the change made in the builder and published instead.
    if (row.publishedContent) return { ...base, calloutChars: [body.length, body.length], movedChars: 0, skipped: "has a published snapshot" };
    const split = splitWordStudyCallout(body);
    if (!split) return { ...base, calloutChars: [body.length, body.length], movedChars: 0, skipped: "unrecognized HTML" };
    return { ...base, calloutChars: [body.length, split.callout.length], movedChars: split.rest.length };
  });
}

/**
 * Applies one planned repair in a transaction: the callout keeps the word
 * study, a new text block right after it holds the rest, and every later
 * block moves down one. Existing block ids are kept (saved answers point at
 * them). Re-reads the callout inside the transaction, so a repair that
 * already ran is a no-op.
 */
export async function applyWordStudyRepair(db: Db, repair: CalloutRepair): Promise<boolean> {
  if (repair.skipped) return false;
  return db.transaction(async (tx) => {
    const [block] = await tx
      .select()
      .from(contentBlocks)
      .where(eq(contentBlocks.id, repair.blockId))
      .for("update");
    const split = block?.body ? splitWordStudyCallout(block.body) : null;
    if (!block || !split) return false;

    const later = await tx
      .select({ id: contentBlocks.id })
      .from(contentBlocks)
      .where(and(eq(contentBlocks.lessonId, block.lessonId), gt(contentBlocks.orderIndex, block.orderIndex)));
    if (later.length > 0) {
      await tx
        .update(contentBlocks)
        .set({ orderIndex: sql`${contentBlocks.orderIndex} + 1` })
        .where(inArray(contentBlocks.id, later.map((b) => b.id)));
    }
    await tx.update(contentBlocks).set({ body: sanitizeHtml(split.callout) }).where(eq(contentBlocks.id, block.id));
    await tx.insert(contentBlocks).values({
      lessonId: block.lessonId,
      orderIndex: block.orderIndex + 1,
      type: "text",
      body: sanitizeHtml(split.rest),
    });
    return true;
  });
}
