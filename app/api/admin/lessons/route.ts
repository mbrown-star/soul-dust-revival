import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { lessons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  lessonCreateSchema,
  lessonUpdateSchema,
  lessonReorderSchema,
  lessonBulkPublishSchema,
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
