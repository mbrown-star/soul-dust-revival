import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { lessons, contentBlocks, lessonProgress, responses } from "@/lib/db/schema";
import { eq, and, asc, inArray, max, ne } from "drizzle-orm";
import type { StudyWeekContent, StudyStation } from "@/lib/study/studyContent";
import { writeOrderIndexes } from "@/lib/db/order";
import {
  lessonCreateSchema,
  lessonUpdateSchema,
  lessonReorderSchema,
  lessonBulkPublishSchema,
  lessonStudyContentUpdateSchema,
  lessonDeleteSchema,
} from "@/lib/validation/schemas";

// Thrown inside the studyContent transaction to roll it back and answer 400.
class StudyContentInputError extends Error {}

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

  // Bulk reorder: every lesson of one study, [{ id, orderIndex }, ...]
  if (Array.isArray(json.reorder)) {
    const parsed = lessonReorderSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    const orderedIds = [...parsed.data.reorder].sort((a, b) => a.orderIndex - b.orderIndex).map((r) => r.id);
    const rows = await db
      .select({ id: lessons.id, studyId: lessons.studyId })
      .from(lessons)
      .where(inArray(lessons.id, orderedIds));
    const studyIds = new Set(rows.map((r) => r.studyId));
    if (rows.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length || studyIds.size !== 1) {
      return NextResponse.json(
        { error: "invalid_input", details: { formErrors: ["Every id must be a distinct lesson of the same study."] } },
        { status: 400 }
      );
    }
    const [studyId] = [...studyIds];
    const total = await db.$count(lessons, eq(lessons.studyId, studyId!));
    if (total !== orderedIds.length) {
      return NextResponse.json({ error: "stale", message: "This study changed elsewhere -- reload to see the latest." }, { status: 409 });
    }

    await db.transaction((tx) => writeOrderIndexes(tx, lessons, orderedIds));
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

    const lessonId = parsed.data.id;

    try {
      const updated = await db.transaction(async (tx) => {
        // Locked so two concurrent saves of the same week (two tabs) run one
        // after the other instead of both deciding which blocks to keep.
        const [lesson] = await tx
          .select({ studyContent: lessons.studyContent })
          .from(lessons)
          .where(eq(lessons.id, lessonId))
          .for("update");
        if (!lesson) throw new StudyContentInputError("Lesson not found.");

        const ids = parsed.data.studyContent.stations.map((s) => s.questionBlockId).filter(Boolean);
        if (new Set(ids).size !== ids.length) {
          throw new StudyContentInputError("Two stations share the same question -- reload and try again.");
        }

        const [{ maxOrder } = { maxOrder: null }] = await tx
          .select({ maxOrder: max(contentBlocks.orderIndex) })
          .from(contentBlocks)
          .where(eq(contentBlocks.lessonId, lessonId));
        let nextOrderIndex = (maxOrder ?? -1) + 1;
        const stations: StudyStation[] = [];
        // Sequential, not Promise.all: every statement here shares the one
        // transaction connection anyway, and a running counter is only safe
        // when nothing interleaves between reading and bumping it.
        for (const station of parsed.data.studyContent.stations) {
          if (station.questionBlockId) {
            // Scoped to this lesson and to question blocks: a stale or
            // hand-crafted id must not overwrite another lesson's block, or a
            // non-question block of this one.
            const [owned] = await tx
              .update(contentBlocks)
              .set({ questionPrompt: station.question })
              .where(
                and(
                  eq(contentBlocks.id, station.questionBlockId),
                  eq(contentBlocks.lessonId, lessonId),
                  eq(contentBlocks.type, "question")
                )
              )
              .returning({ id: contentBlocks.id });
            if (owned) {
              stations.push(station);
              continue;
            }
            // The builder assigns a new station's id up front (so a save
            // in flight can never disagree with the client about it). An id
            // that exists nowhere yet is created here; one that exists
            // anywhere else is refused.
            const elsewhere = await tx
              .select({ id: contentBlocks.id })
              .from(contentBlocks)
              .where(eq(contentBlocks.id, station.questionBlockId))
              .limit(1);
            if (elsewhere.length > 0) {
              throw new StudyContentInputError("A station's question doesn't belong to this lesson -- reload and try again.");
            }
            await tx.insert(contentBlocks).values({
              id: station.questionBlockId,
              lessonId,
              orderIndex: nextOrderIndex++,
              type: "question",
              questionPrompt: station.question,
            });
            stations.push(station);
            continue;
          }
          const [block] = await tx
            .insert(contentBlocks)
            .values({ lessonId, orderIndex: nextOrderIndex++, type: "question", questionPrompt: station.question })
            .returning({ id: contentBlocks.id });
          if (!block) throw new Error("Failed to create a content block for a new station.");
          stations.push({ ...station, questionBlockId: block.id });
        }

        // A removed station's question block is deleted too, unless readers
        // already saved answers to it -- those stay so the answers aren't
        // orphaned (the block is simply no longer shown).
        const keptIds = new Set(stations.map((s) => s.questionBlockId));
        const removedIds = (lesson.studyContent?.stations ?? [])
          .map((s) => s.questionBlockId)
          .filter((id) => id && !keptIds.has(id));
        if (removedIds.length > 0) {
          const answered = await tx
            .selectDistinct({ id: responses.contentBlockId })
            .from(responses)
            .where(inArray(responses.contentBlockId, removedIds));
          const answeredIds = new Set(answered.map((r) => r.id));
          const deletable = removedIds.filter((id) => !answeredIds.has(id));
          if (deletable.length > 0) {
            await tx
              .delete(contentBlocks)
              .where(and(inArray(contentBlocks.id, deletable), eq(contentBlocks.lessonId, lessonId)));
          }
        }

        const studyContent: StudyWeekContent = {
          ...parsed.data.studyContent,
          stations,
          // The reader numbers practices from `n`, so it follows list order
          // rather than trusting a hand-maintained number.
          practices: parsed.data.studyContent.practices.map((p, i) => ({ ...p, n: i + 1 })),
        };

        const [row] = await tx.update(lessons).set({ studyContent }).where(eq(lessons.id, lessonId)).returning();
        return row;
      });
      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof StudyContentInputError) {
        return NextResponse.json({ error: "invalid_input", details: { formErrors: [err.message] } }, { status: 400 });
      }
      throw err;
    }
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

// Permanently deletes a draft lesson with its blocks. Refused for a published
// lesson (unpublish it first, so readers never lose a lesson mid-study) and
// for one any reader has answered or made progress on -- the admin's own
// preview answers/progress don't count and are removed with it.
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = lessonDeleteSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { id } = parsed.data;

  const db = await getDb();
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, id) });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lesson.published) {
    return NextResponse.json(
      { error: "published", message: "Unpublish this lesson before deleting it." },
      { status: 409 }
    );
  }

  const blockIds = (
    await db.select({ id: contentBlocks.id }).from(contentBlocks).where(eq(contentBlocks.lessonId, id))
  ).map((b) => b.id);
  const readerAnswers =
    blockIds.length === 0
      ? 0
      : await db.$count(responses, and(inArray(responses.contentBlockId, blockIds), ne(responses.userId, session.userId)));
  const readerProgress = await db.$count(
    lessonProgress,
    and(eq(lessonProgress.lessonId, id), ne(lessonProgress.userId, session.userId))
  );
  if (readerAnswers > 0 || readerProgress > 0) {
    return NextResponse.json(
      {
        error: "has_reader_data",
        message: "Readers have answers or progress on this lesson, so it can't be deleted. Keep it as a draft instead.",
      },
      { status: 409 }
    );
  }

  await db.transaction(async (tx) => {
    if (blockIds.length > 0) await tx.delete(responses).where(inArray(responses.contentBlockId, blockIds));
    await tx.delete(lessonProgress).where(eq(lessonProgress.lessonId, id));
    await tx.delete(contentBlocks).where(eq(contentBlocks.lessonId, id));
    await tx.delete(lessons).where(eq(lessons.id, id));
    const remaining = await tx
      .select({ id: lessons.id })
      .from(lessons)
      .where(eq(lessons.studyId, lesson.studyId))
      .orderBy(asc(lessons.orderIndex));
    await writeOrderIndexes(tx, lessons, remaining.map((l) => l.id));
  });

  return NextResponse.json({ ok: true });
}
