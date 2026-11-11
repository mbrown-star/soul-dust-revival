import { and, asc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { writeOrderIndexes } from "@/lib/db/order";
import { contentBlocks, lessons, responses } from "@/lib/db/schema";
import type { ContentBlockData } from "@/lib/content/blocks";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import type { PublishedLessonContent } from "./publishedContentTypes";

export type { PublishedLessonContent } from "./publishedContentTypes";

/**
 * Draft and publish for lessons.
 *
 * The builder always edits the *working copy*: content_blocks rows and
 * lessons.study_content. A published lesson also carries a frozen snapshot
 * (lessons.published_content) that readers render instead, so edits reach
 * readers only when an admin publishes them. Title, Published, Free sample
 * and lesson order are not drafted -- they save live.
 *
 * Every rule lives here; the admin routes call these inside their own
 * transactions, and the reader page/signing route use readerContent().
 */

type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
type BlockRow = typeof contentBlocks.$inferSelect;

/** A block row as the reader renders it (drops lessonId/order/removedAt). */
export function toBlockData(row: BlockRow): ContentBlockData {
  return {
    id: row.id,
    type: row.type,
    body: row.body,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    mediaId: row.mediaId,
    mediaUrl: row.mediaUrl,
    captionsUrl: row.captionsUrl,
    transcript: row.transcript,
    questionPrompt: row.questionPrompt,
    calloutTitle: row.calloutTitle,
    calloutColor: row.calloutColor,
  };
}

/** The working copy's blocks, in order (removed ones excluded). */
export async function workingBlockRows(db: Executor, lessonId: string): Promise<BlockRow[]> {
  return db
    .select()
    .from(contentBlocks)
    .where(and(eq(contentBlocks.lessonId, lessonId), isNull(contentBlocks.removedAt)))
    .orderBy(asc(contentBlocks.orderIndex));
}

async function freezeWorkingCopy(db: Executor, lessonId: string, studyContent: StudyWeekContent | null): Promise<PublishedLessonContent> {
  const rows = await workingBlockRows(db, lessonId);
  return { blocks: rows.map(toBlockData), studyContent, publishedAt: new Date().toISOString() };
}

async function lockLesson(db: Executor, lessonId: string) {
  const [lesson] = await db
    .select({
      id: lessons.id,
      published: lessons.published,
      studyContent: lessons.studyContent,
      publishedContent: lessons.publishedContent,
      hasDraftChanges: lessons.hasDraftChanges,
    })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .for("update");
  return lesson ?? null;
}

/** Block ids a lesson's published snapshot shows, directly or as a week station's answer. */
export function snapshotBlockIds(content: PublishedLessonContent | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!content) return ids;
  for (const block of content.blocks) ids.add(block.id);
  for (const station of content.studyContent?.stations ?? []) if (station.questionBlockId) ids.add(station.questionBlockId);
  return ids;
}

/**
 * Call before any write to a lesson's working copy. For a published lesson,
 * freezes the current (pre-edit) content as its snapshot if it has none yet
 * -- so readers keep seeing it -- and marks it as having draft changes.
 * Drafts are left alone: readers can't see them anyway.
 */
export async function ensureSnapshot(db: Executor, lessonId: string): Promise<void> {
  const lesson = await lockLesson(db, lessonId);
  if (!lesson || !lesson.published) return;
  if (!lesson.publishedContent) {
    const publishedContent = await freezeWorkingCopy(db, lessonId, lesson.studyContent ?? null);
    await db.update(lessons).set({ publishedContent, hasDraftChanges: true }).where(eq(lessons.id, lessonId));
  } else if (!lesson.hasDraftChanges) {
    await db.update(lessons).set({ hasDraftChanges: true }).where(eq(lessons.id, lessonId));
  }
}

/**
 * Removes blocks from a lesson's working copy. A block its published
 * snapshot still shows is only marked removed (readers may still answer it,
 * and Discard can restore it); any other block is deleted.
 */
export async function removeBlocks(db: Executor, lessonId: string, ids: string[]): Promise<{ setAside: string[] }> {
  if (ids.length === 0) return { setAside: [] };
  const [lesson] = await db.select({ publishedContent: lessons.publishedContent }).from(lessons).where(eq(lessons.id, lessonId));
  const shown = snapshotBlockIds(lesson?.publishedContent);
  const keep = ids.filter((id) => shown.has(id));
  const drop = ids.filter((id) => !shown.has(id));
  if (keep.length > 0) {
    await db
      .update(contentBlocks)
      .set({ removedAt: new Date() })
      .where(and(inArray(contentBlocks.id, keep), eq(contentBlocks.lessonId, lessonId)));
  }
  if (drop.length > 0) {
    await db.delete(contentBlocks).where(and(inArray(contentBlocks.id, drop), eq(contentBlocks.lessonId, lessonId)));
  }
  return { setAside: keep };
}

/**
 * Brings a removed block back into the working copy at `position` (Undo of
 * removing a block the published version still shows) -- the original row,
 * so answers readers saved to it stay attached.
 */
export async function restoreBlock(db: Executor, lessonId: string, blockId: string, position: number): Promise<BlockRow | null> {
  const [row] = await db
    .update(contentBlocks)
    .set({ removedAt: null })
    .where(and(eq(contentBlocks.id, blockId), eq(contentBlocks.lessonId, lessonId), isNotNull(contentBlocks.removedAt)))
    .returning();
  if (!row) return null;
  const others = (await workingBlockRows(db, lessonId)).filter((b) => b.id !== blockId).map((b) => b.id);
  const index = Math.max(0, Math.min(position, others.length));
  others.splice(index, 0, blockId);
  await writeOrderIndexes(db, contentBlocks, others);
  return { ...row, orderIndex: index };
}

// Removed blocks nobody answered are no longer needed once the snapshot that
// showed them is replaced or cleared. Answered ones stay (hidden) so the
// answers' foreign key holds.
async function purgeRemovedBlocks(db: Executor, lessonId: string): Promise<void> {
  const answered = db.selectDistinct({ id: responses.contentBlockId }).from(responses);
  try {
    // A savepoint: a reader answering one of these blocks at this exact moment
    // makes the delete hit the answers' foreign key. Cleanup is optional, so
    // that rolls back only the cleanup, never the publish around it.
    await db.transaction((sp) =>
      sp
        .delete(contentBlocks)
        .where(and(eq(contentBlocks.lessonId, lessonId), isNotNull(contentBlocks.removedAt), notInArray(contentBlocks.id, answered)))
    );
  } catch (err) {
    if ((err as { cause?: { code?: string }; code?: string }).cause?.code === "23503" || (err as { code?: string }).code === "23503") return;
    throw err;
  }
}

export class LessonPublishError extends Error {}

/** Makes a published lesson's working copy what readers see. */
export async function publishChanges(db: Executor, lessonId: string): Promise<void> {
  const lesson = await lockLesson(db, lessonId);
  if (!lesson) throw new LessonPublishError("Lesson not found.");
  if (!lesson.published) throw new LessonPublishError("Publish the lesson first -- a draft has no published version yet.");
  const publishedContent = await freezeWorkingCopy(db, lessonId, lesson.studyContent ?? null);
  await db.update(lessons).set({ publishedContent, hasDraftChanges: false }).where(eq(lessons.id, lessonId));
  await purgeRemovedBlocks(db, lessonId);
}

/**
 * Puts a published lesson's working copy back to its published snapshot:
 * restores each published block's fields and order (un-removing any that
 * were removed), deletes blocks added since, and restores the week. Answers
 * the acting admin saved while previewing a discarded block go with it; a
 * discarded block someone else answered is kept, removed, so their answer
 * isn't lost.
 */
export async function discardChanges(db: Executor, lessonId: string, adminUserId: string): Promise<void> {
  const lesson = await lockLesson(db, lessonId);
  if (!lesson) throw new LessonPublishError("Lesson not found.");
  const snapshot = lesson.publishedContent;
  if (!lesson.published || !snapshot) {
    // Nothing published to go back to (or never edited since publishing).
    await db.update(lessons).set({ hasDraftChanges: false }).where(eq(lessons.id, lessonId));
    return;
  }

  const shown = snapshotBlockIds(snapshot);
  const rows = await db.select({ id: contentBlocks.id }).from(contentBlocks).where(eq(contentBlocks.lessonId, lessonId));
  const extra = rows.map((r) => r.id).filter((id) => !shown.has(id));
  if (extra.length > 0) {
    await db.delete(responses).where(and(inArray(responses.contentBlockId, extra), eq(responses.userId, adminUserId)));
    const answered = await db.selectDistinct({ id: responses.contentBlockId }).from(responses).where(inArray(responses.contentBlockId, extra));
    const answeredIds = new Set(answered.map((r) => r.id));
    const deletable = extra.filter((id) => !answeredIds.has(id));
    if (deletable.length > 0) await db.delete(contentBlocks).where(inArray(contentBlocks.id, deletable));
    const keep = extra.filter((id) => answeredIds.has(id));
    if (keep.length > 0) await db.update(contentBlocks).set({ removedAt: new Date() }).where(inArray(contentBlocks.id, keep));
  }

  // Each published block back exactly as it was, in its published position.
  // Upserted, so a row that somehow went missing comes back with its id.
  for (const [orderIndex, block] of snapshot.blocks.entries()) {
    const { id, ...fields } = block;
    await db
      .insert(contentBlocks)
      .values({ id, lessonId, orderIndex, ...fields, removedAt: null })
      .onConflictDoUpdate({ target: contentBlocks.id, set: { ...fields, orderIndex, removedAt: null } });
  }
  // A week's station answers aren't in `blocks`; un-remove them too.
  const stationIds = (snapshot.studyContent?.stations ?? []).map((s) => s.questionBlockId).filter(Boolean);
  if (stationIds.length > 0) {
    await db
      .update(contentBlocks)
      .set({ removedAt: null })
      .where(and(inArray(contentBlocks.id, stationIds), eq(contentBlocks.lessonId, lessonId)));
  }

  await db
    .update(lessons)
    .set({ studyContent: snapshot.studyContent, hasDraftChanges: false })
    .where(eq(lessons.id, lessonId));
}

/**
 * Applies a change to a lesson's Published state. Publishing freezes the
 * current working copy (what you publish is what you see); unpublishing
 * clears the snapshot. No-op when the state doesn't actually change, so
 * title edits that resend `published` don't re-snapshot.
 */
export async function applyPublishedChange(db: Executor, lessonId: string, published: boolean): Promise<void> {
  const lesson = await lockLesson(db, lessonId);
  if (!lesson || lesson.published === published) return;
  const publishedContent = published ? await freezeWorkingCopy(db, lessonId, lesson.studyContent ?? null) : null;
  await db.update(lessons).set({ published, publishedContent, hasDraftChanges: false }).where(eq(lessons.id, lessonId));
  await purgeRemovedBlocks(db, lessonId);
}

/**
 * Publishes every draft lesson of a study at once ("Publish all"), freezing
 * each one's working copy. Already-published lessons are left as they are,
 * draft changes included.
 */
export async function publishAllInStudy(db: Executor, studyId: string): Promise<void> {
  // Bulk, since a study can have hundreds of draft lessons (a year-long
  // devotional): one read of every draft's blocks, then one write per lesson.
  // Drafts have no snapshot, so nothing is set aside and nothing needs purging.
  const drafts = await db
    .select({ id: lessons.id, studyContent: lessons.studyContent })
    .from(lessons)
    .where(and(eq(lessons.studyId, studyId), eq(lessons.published, false)))
    .for("update");
  if (drafts.length === 0) return;
  const rows = await db
    .select()
    .from(contentBlocks)
    .where(and(inArray(contentBlocks.lessonId, drafts.map((d) => d.id)), isNull(contentBlocks.removedAt)))
    .orderBy(asc(contentBlocks.orderIndex));
  const blocksByLesson = new Map<string, ContentBlockData[]>();
  for (const row of rows) {
    const list = blocksByLesson.get(row.lessonId) ?? [];
    list.push(toBlockData(row));
    blocksByLesson.set(row.lessonId, list);
  }
  const publishedAt = new Date().toISOString();
  for (const draft of drafts) {
    const publishedContent: PublishedLessonContent = {
      blocks: blocksByLesson.get(draft.id) ?? [],
      studyContent: draft.studyContent ?? null,
      publishedAt,
    };
    await db.update(lessons).set({ published: true, publishedContent, hasDraftChanges: false }).where(eq(lessons.id, draft.id));
  }
}

/** Unpublishes every lesson of a study, clearing their snapshots. */
export async function unpublishAllInStudy(db: Executor, studyId: string): Promise<void> {
  const live = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.studyId, studyId), eq(lessons.published, true)));
  for (const { id } of live) await applyPublishedChange(db, id, false);
}

export type ReaderContent = {
  blocks: ContentBlockData[];
  studyContent: StudyWeekContent | null;
  /** True when an admin is looking at unpublished changes. */
  isDraftPreview: boolean;
};

/**
 * What a reader sees of a lesson: its published snapshot when it has one,
 * otherwise the working copy (a draft, or a published lesson nobody has
 * edited since draft-and-publish existed -- identical either way). An admin
 * can ask for the working copy instead to preview unpublished changes.
 */
export function readerContent(
  lesson: { publishedContent: PublishedLessonContent | null; studyContent: StudyWeekContent | null; hasDraftChanges: boolean },
  workingBlocks: ContentBlockData[],
  opts: { draftPreview: boolean }
): ReaderContent {
  if (lesson.publishedContent && !opts.draftPreview) {
    return { blocks: lesson.publishedContent.blocks, studyContent: lesson.publishedContent.studyContent, isDraftPreview: false };
  }
  return {
    blocks: workingBlocks,
    studyContent: lesson.studyContent,
    isDraftPreview: opts.draftPreview && !!lesson.publishedContent && lesson.hasDraftChanges,
  };
}
