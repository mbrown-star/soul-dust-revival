import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { studies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { studySchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = studySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const [study] = await db
    .insert(studies)
    .values({
      productId: body.productId,
      title: body.title,
      slug: body.slug,
      description: body.description,
      coverImageUrl: body.coverImageUrl,
      coverImageAlt: body.coverImageAlt,
      published: body.published ?? false,
    })
    .returning();

  return NextResponse.json(study);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = studySchema.safeParse(json);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const body = parsed.data;

  const [updated] = await db
    .update(studies)
    .set({
      productId: body.productId,
      title: body.title,
      slug: body.slug,
      description: body.description,
      coverImageUrl: body.coverImageUrl,
      coverImageAlt: body.coverImageAlt,
      published: body.published,
    })
    .where(eq(studies.id, body.id!))
    .returning();

  return NextResponse.json(updated);
}
