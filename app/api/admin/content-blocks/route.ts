import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { contentBlocks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import DOMPurify from "isomorphic-dompurify";
import {
  contentBlockCreateSchema,
  contentBlockUpdateSchema,
  contentBlockReorderSchema,
  contentBlockDeleteSchema,
} from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = contentBlockCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const existing = await db.select().from(contentBlocks).where(eq(contentBlocks.lessonId, body.lessonId));

  const [block] = await db
    .insert(contentBlocks)
    .values({
      lessonId: body.lessonId,
      type: body.type,
      orderIndex: existing.length, // append to end
    })
    .returning();

  return NextResponse.json(block);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();

  // Bulk reorder after drag-and-drop: [{ id, orderIndex }, ...]
  if (Array.isArray(json.reorder)) {
    const parsed = contentBlockReorderSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    for (const { id, orderIndex } of parsed.data.reorder) {
      await db.update(contentBlocks).set({ orderIndex }).where(eq(contentBlocks.id, id));
    }
    return NextResponse.json({ ok: true });
  }

  const parsed = contentBlockUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  // Sanitize rich-text HTML on write, in addition to sanitizing again on render
  // (components/study/LessonBlock.tsx) — defense in depth. Only admins can
  // write this content today, but sanitizing at the write boundary means the
  // stored data is safe even if that assumption changes later (e.g. multiple
  // content contributors, a future public-submission feature).
  const sanitizedBody = body.body != null ? DOMPurify.sanitize(body.body) : body.body;

  const [updated] = await db
    .update(contentBlocks)
    .set({
      body: sanitizedBody,
      imageUrl: body.imageUrl,
      imageAlt: body.imageAlt,
      mediaId: body.mediaId,
      captionsUrl: body.captionsUrl,
      transcript: body.transcript,
      questionPrompt: body.questionPrompt,
      calloutTitle: body.calloutTitle,
      calloutColor: body.calloutColor,
    })
    .where(eq(contentBlocks.id, body.id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = contentBlockDeleteSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  await db.delete(contentBlocks).where(eq(contentBlocks.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}
