import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { studies, lessons, contentBlocks, lessonProgress, responses, orderItems, entitlements } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { studySchema, studyDeleteSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = studySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const db = await getDb();

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
  const db = await getDb();

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

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = (await req.json()) as Record<string, unknown>;
  const parsed = studyDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id } = parsed.data;
  const db = await getDb();

  // Same safety check as the product DELETE route: a study whose product has
  // real purchase history is never silently cascaded away, since that would
  // destroy a paying customer's lesson progress/responses out from under a
  // still-valid order or entitlement. Deactivating the study (or the linked
  // product) is the right tool once it's actually been sold.
  const [study] = await db.select({ productId: studies.productId }).from(studies).where(eq(studies.id, id)).limit(1);
  if (study?.productId) {
    const [linkedOrderItem] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, study.productId))
      .limit(1);
    if (linkedOrderItem) {
      return NextResponse.json(
        { error: "has_orders", message: "This study's product has order history and can't be deleted." },
        { status: 409 }
      );
    }
    const [linkedEntitlement] = await db
      .select({ id: entitlements.id })
      .from(entitlements)
      .where(eq(entitlements.productId, study.productId))
      .limit(1);
    if (linkedEntitlement) {
      return NextResponse.json(
        { error: "has_entitlements", message: "This study's product has been granted to a user and can't be deleted." },
        { status: 409 }
      );
    }
  }

  // No cascade is declared on these foreign keys, and a study's lessons /
  // content blocks / user progress / responses aren't meaningful without
  // their study, so deleting one means deleting all of it -- in dependency
  // order, inside one transaction so a failure partway through can't leave
  // orphaned rows.
  await db.transaction(async (tx) => {
    const studyLessons = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, id));
    const lessonIds = studyLessons.map((l) => l.id);

    if (lessonIds.length > 0) {
      const blocks = await tx
        .select({ id: contentBlocks.id })
        .from(contentBlocks)
        .where(inArray(contentBlocks.lessonId, lessonIds));
      const blockIds = blocks.map((b) => b.id);

      if (blockIds.length > 0) {
        await tx.delete(responses).where(inArray(responses.contentBlockId, blockIds));
      }
      await tx.delete(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds));
      await tx.delete(contentBlocks).where(inArray(contentBlocks.lessonId, lessonIds));
      await tx.delete(lessons).where(eq(lessons.studyId, id));
    }

    await tx.delete(studies).where(eq(studies.id, id));
  });

  return NextResponse.json({ ok: true });
}
