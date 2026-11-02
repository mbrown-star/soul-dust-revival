import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { lessons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { lessonCreateSchema, lessonUpdateSchema, lessonReorderSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = lessonCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const existing = await db.select().from(lessons).where(eq(lessons.studyId, body.studyId));

  const [lesson] = await db
    .insert(lessons)
    .values({
      studyId: body.studyId,
      title: body.title,
      orderIndex: existing.length, // append to end
      published: body.published ?? false,
    })
    .returning();

  return NextResponse.json(lesson);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();

  // Bulk reorder: [{ id, orderIndex }, ...]
  if (Array.isArray(json.reorder)) {
    const parsed = lessonReorderSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    for (const { id, orderIndex } of parsed.data.reorder) {
      await db.update(lessons).set({ orderIndex }).where(eq(lessons.id, id));
    }
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
