import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { leaderResources } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sanitizeHtml } from "@/lib/sanitize/html";
import {
  leaderResourceCreateSchema,
  leaderResourceUpdateSchema,
  leaderResourceReorderSchema,
  leaderResourceDeleteSchema,
} from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const parsed = leaderResourceCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = await getDb();
  // Only the count is needed here (to append at the end of the existing
  // order), so count in SQL rather than fetching every row across the wire.
  const existingCount = await db.$count(leaderResources);

  const [resource] = await db
    .insert(leaderResources)
    .values({
      title: parsed.data.title,
      orderIndex: existingCount,
      published: false,
    })
    .returning();

  return NextResponse.json(resource);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const db = await getDb();

  if (Array.isArray(json.reorder)) {
    const parsed = leaderResourceReorderSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

    for (const { id, orderIndex } of parsed.data.reorder) {
      await db.update(leaderResources).set({ orderIndex }).where(eq(leaderResources.id, id));
    }
    return NextResponse.json({ ok: true });
  }

  const parsed = leaderResourceUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  // Sanitize on write, same defense-in-depth pattern as lesson content and
  // studies import — see SECURITY.md.
  const sanitizedBody = body.body != null ? sanitizeHtml(body.body) : body.body;

  const [updated] = await db
    .update(leaderResources)
    .set({
      title: body.title,
      body: sanitizedBody,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      published: body.published,
    })
    .where(eq(leaderResources.id, body.id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const parsed = leaderResourceDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = await getDb();
  await db.delete(leaderResources).where(eq(leaderResources.id, parsed.data.id));

  return NextResponse.json({ ok: true });
}
