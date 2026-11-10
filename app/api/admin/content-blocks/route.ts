import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { contentBlocks, lessons, responses } from "@/lib/db/schema";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { sanitizeHtml } from "@/lib/sanitize/html";
import { writeOrderIndexes } from "@/lib/db/order";
import { fieldsOutsideType, withExclusiveMediaSource } from "@/lib/content/blocks";
import {
  contentBlockCreateSchema,
  contentBlockUpdateSchema,
  contentBlockReorderSchema,
  contentBlockDeleteSchema,
} from "@/lib/validation/schemas";

function invalid(details?: unknown) {
  return NextResponse.json({ error: "invalid_input", details }, { status: 400 });
}

// Sanitize rich-text HTML on write, in addition to sanitizing again on render
// (components/study/LessonBlock.tsx) -- defense in depth, so stored data is
// safe even if who can write it ever widens beyond admins.
function sanitizeFields<T extends { body?: string | null }>(fields: T): T {
  return fields.body != null ? { ...fields, body: sanitizeHtml(fields.body) } : fields;
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = contentBlockCreateSchema.safeParse(await req.json());
  if (!parsed.success) return invalid(parsed.error.flatten());
  const { lessonId, type, insertAt, initial = {} } = parsed.data;

  const foreign = fieldsOutsideType(type, initial);
  if (foreign.length > 0) return invalid({ fieldErrors: { initial: [`Not used by a ${type} block: ${foreign.join(", ")}`] } });

  const db = await getDb();
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId), columns: { id: true } });
  if (!lesson) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const block = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: contentBlocks.id })
      .from(contentBlocks)
      .where(eq(contentBlocks.lessonId, lessonId))
      .orderBy(asc(contentBlocks.orderIndex));
    const position = Math.min(insertAt ?? existing.length, existing.length);

    const [inserted] = await tx
      .insert(contentBlocks)
      .values({ lessonId, type, orderIndex: position, ...withExclusiveMediaSource(sanitizeFields(initial)) })
      .returning();
    if (!inserted) throw new Error("Failed to create content block.");

    // Rewritten even when appending: lessons edited before order was kept
    // dense can have gaps (e.g. 0, 2, 3), and appending at `count` would
    // then tie with an existing block.
    const ids = existing.map((b) => b.id);
    ids.splice(position, 0, inserted.id);
    await writeOrderIndexes(tx, contentBlocks, ids);
    return { ...inserted, orderIndex: position };
  });

  return NextResponse.json(block);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const db = await getDb();

  if (Array.isArray(json.reorder)) {
    const parsed = contentBlockReorderSchema.safeParse(json);
    if (!parsed.success) return invalid(parsed.error.flatten());

    const orderedIds = [...parsed.data.reorder].sort((a, b) => a.orderIndex - b.orderIndex).map((r) => r.id);
    const rows = await db
      .select({ id: contentBlocks.id, lessonId: contentBlocks.lessonId })
      .from(contentBlocks)
      .where(inArray(contentBlocks.id, orderedIds));
    const lessonIds = new Set(rows.map((r) => r.lessonId));
    if (rows.length !== new Set(orderedIds).size || rows.length !== orderedIds.length || lessonIds.size !== 1) {
      return invalid({ formErrors: ["Every id must be a distinct block of the same lesson."] });
    }
    const [lessonId] = [...lessonIds];

    // A partial list (e.g. a second tab added a block since this page loaded)
    // would leave the missing block's position colliding with another's.
    const total = await db.$count(contentBlocks, eq(contentBlocks.lessonId, lessonId!));
    if (total !== orderedIds.length) {
      return NextResponse.json({ error: "stale", message: "This lesson changed elsewhere -- reload to see the latest." }, { status: 409 });
    }

    await db.transaction((tx) => writeOrderIndexes(tx, contentBlocks, orderedIds));
    return NextResponse.json({ ok: true });
  }

  const parsed = contentBlockUpdateSchema.safeParse(json);
  if (!parsed.success) return invalid(parsed.error.flatten());
  const { id, ...fields } = parsed.data;

  const existing = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, id), columns: { type: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const foreign = fieldsOutsideType(existing.type, fields);
  if (foreign.length > 0) return invalid({ fieldErrors: { id: [`Not used by a ${existing.type} block: ${foreign.join(", ")}`] } });

  const [updated] = await db
    .update(contentBlocks)
    .set(withExclusiveMediaSource(sanitizeFields(fields)))
    .where(eq(contentBlocks.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = contentBlockDeleteSchema.safeParse(await req.json());
  if (!parsed.success) return invalid(parsed.error.flatten());
  const { id } = parsed.data;

  const db = await getDb();
  const block = await db.query.contentBlocks.findFirst({ where: eq(contentBlocks.id, id) });
  if (!block) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A question block readers have already answered can't be deleted out from
  // under their saved answers (responses.content_block_id is a foreign key,
  // so this was previously an unhandled 500). The admin's own answers, typed
  // while previewing, don't count -- they're removed along with the block.
  const answered = await db.$count(
    responses,
    and(eq(responses.contentBlockId, id), ne(responses.userId, session.userId))
  );
  if (answered > 0) {
    return NextResponse.json(
      { error: "has_responses", message: "Readers have saved answers to this question, so it can't be deleted." },
      { status: 409 }
    );
  }

  // A Study week's station questions are owned by its structured content --
  // deleting one directly would leave the station pointing at nothing.
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, block.lessonId), columns: { studyContent: true } });
  if (lesson?.studyContent?.stations.some((s) => s.questionBlockId === id)) {
    return NextResponse.json(
      { error: "owned_by_station", message: "This question belongs to a Work the Word station -- remove the station instead." },
      { status: 409 }
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(responses).where(and(eq(responses.contentBlockId, id), eq(responses.userId, session.userId)));
    await tx.delete(contentBlocks).where(eq(contentBlocks.id, id));
    const remaining = await tx
      .select({ id: contentBlocks.id })
      .from(contentBlocks)
      .where(eq(contentBlocks.lessonId, block.lessonId))
      .orderBy(asc(contentBlocks.orderIndex));
    await writeOrderIndexes(tx, contentBlocks, remaining.map((b) => b.id));
  });

  return NextResponse.json({ ok: true });
}
