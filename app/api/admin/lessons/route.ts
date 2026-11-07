import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { lessons, contentBlocks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import {
  lessonCreateSchema,
  lessonUpdateSchema,
  lessonReorderSchema,
  lessonBulkPublishSchema,
  lessonStudyContentUpdateSchema,
} from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const parsed = lessonCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const db = await getDb();

  // Only the count is needed here (to append at the end), so count in SQL
  // rather than fetching every row across the wire.
  const existingCount = await db.$count(lessons, eq(lessons.studyId, body.studyId));

  const [lesson] = await db
    .insert(lessons)
    .values({
      studyId: body.studyId,
      title: body.title,
      orderIndex: existingCount, // append to end
      published: body.published ?? false,
    })
    .returning();

  return NextResponse.json(lesson);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const db = await getDb();

  // Bulk reorder: [{ id, orderIndex }, ...]
  if (Array.isArray(json.reorder)) {
    const parsed = lessonReorderSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    for (const { id, orderIndex } of parsed.data.reorder) {
      await db.update(lessons).set({ orderIndex }).where(eq(lessons.id, id));
    }
    return NextResponse.json({ ok: true });
  }

  // Bulk publish/unpublish every lesson in a study: { studyId, published }.
  // An imported study's lessons are created as drafts for review -- once
  // review is done, toggling potentially hundreds of lessons one at a time
  // isn't a reasonable workflow.
  if (typeof json.studyId === "string" && typeof json.published === "boolean") {
    const parsed = lessonBulkPublishSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    await db
      .update(lessons)
      .set({ published: parsed.data.published })
      .where(eq(lessons.studyId, parsed.data.studyId));
    return NextResponse.json({ ok: true });
  }

  // A Study-kind lesson's full structured content (see
  // lib/study/studyContent.ts) -- the single UI path for this, previously
  // only ever writable via one-off backfill scripts (qa/findings/
  // FINDINGS_2026-11-07.md #8). Each station's answer reuses the existing
  // content_blocks/responses plumbing the reader already depends on, so a
  // new station (sent with questionBlockId: "") gets a real content_blocks
  // row created here, and an existing one has its questionPrompt kept in
  // sync with the station's own question text -- the two are meant to
  // always say the same thing, since the reader shows `question` but saves
  // against `questionBlockId`.
  if (json.studyContent && typeof json.studyContent === "object") {
    const parsed = lessonStudyContentUpdateSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
    }

    const existingBlockCount = await db.$count(contentBlocks, eq(contentBlocks.lessonId, parsed.data.id));

    const stations = await Promise.all(
      parsed.data.studyContent.stations.map(async (station, i) => {
        if (station.questionBlockId) {
          // Scoped to this lesson, not just the block id -- found in review:
          // without this, a stale or hand-crafted questionBlockId could
          // silently overwrite an unrelated lesson's content_block (cross-
          // lesson data corruption, not caught by any other check here since
          // the id alone doesn't prove it belongs to this lesson).
          const [updated] = await db
            .update(contentBlocks)
            .set({ questionPrompt: station.question })
            .where(and(eq(contentBlocks.id, station.questionBlockId), eq(contentBlocks.lessonId, parsed.data.id)))
            .returning({ id: contentBlocks.id });
          if (!updated) {
            throw new Error(`questionBlockId ${station.questionBlockId} does not belong to lesson ${parsed.data.id}`);
          }
          return station;
        }
        // Derived from this station's own array index, not a shared counter
        // mutated across concurrent promises -- found in review: a counter
        // incremented inside a Promise.all map is only safe because map's
        // synchronous callback prefixes happen to run in order before any
        // await suspends, a fragile invariant a future added `await` before
        // the increment could silently break.
        const [block] = await db
          .insert(contentBlocks)
          .values({
            lessonId: parsed.data.id,
            orderIndex: existingBlockCount + i,
            type: "question",
            questionPrompt: station.question,
          })
          .returning();
        if (!block) throw new Error("Failed to create a content block for a new station.");
        return { ...station, questionBlockId: block.id };
      })
    );

    const studyContent: StudyWeekContent = { ...parsed.data.studyContent, stations };

    const [updated] = await db
      .update(lessons)
      .set({ studyContent })
      .where(eq(lessons.id, parsed.data.id))
      .returning();

    return NextResponse.json(updated);
  }

  const parsed = lessonUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(lessons)
    .set({ title: parsed.data.title, published: parsed.data.published })
    .where(eq(lessons.id, parsed.data.id))
    .returning();

  return NextResponse.json(updated);
}
