import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { studies, studyResources } from "@/lib/db/schema";
import { r2, R2_BUCKET } from "@/lib/r2/client";
import {
  studyResourceCreateSchema,
  studyResourceDeleteSchema,
  studyResourceUpdateSchema,
} from "@/lib/validation/schemas";

const invalid = (details: unknown) => NextResponse.json({ error: "invalid_input", details }, { status: 400 });

/** Adds a resource whose PDF the admin has just uploaded through /api/admin/study-resource-upload-url. */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = studyResourceCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.flatten());
  const { studyId, title, description, fileKey, fileName } = parsed.data;

  const db = await getDb();
  const study = await db.query.studies.findFirst({ where: eq(studies.id, studyId), columns: { id: true } });
  if (!study) return NextResponse.json({ error: "not_found", message: "That study doesn't exist." }, { status: 404 });

  // The size and type come from storage, not the browser, and this also
  // confirms the upload actually finished.
  let head;
  try {
    head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: fileKey }));
  } catch {
    return NextResponse.json({ error: "not_uploaded", message: "The file didn't finish uploading. Try again." }, { status: 400 });
  }

  const [{ next }] = (await db
    .select({ next: sql<number>`coalesce(max(${studyResources.orderIndex}) + 1, 0)` })
    .from(studyResources)
    .where(eq(studyResources.studyId, studyId))) as [{ next: number }];

  const [resource] = await db
    .insert(studyResources)
    .values({
      studyId,
      title,
      description: description || null,
      fileKey,
      fileName,
      fileSize: head.ContentLength ?? 0,
      contentType: head.ContentType ?? "application/pdf",
      orderIndex: Number(next),
    })
    .returning();
  return NextResponse.json(resource);
}

/** Renames/re-describes one resource, or reorders a study's resources. */
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = studyResourceUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.flatten());
  const db = await getDb();

  if ("order" in parsed.data) {
    const { studyId, order } = parsed.data;
    const existing = await db
      .select({ id: studyResources.id })
      .from(studyResources)
      .where(eq(studyResources.studyId, studyId))
      .orderBy(asc(studyResources.orderIndex));
    // The new order must be exactly this study's resources, each once.
    const ids = new Set(existing.map((r) => r.id));
    if (order.length !== ids.size || new Set(order).size !== order.length || !order.every((id) => ids.has(id))) {
      return NextResponse.json({ error: "stale", message: "The list changed. Reload and try again." }, { status: 409 });
    }
    await db.transaction(async (tx) => {
      for (const [index, id] of order.entries()) {
        await tx.update(studyResources).set({ orderIndex: index }).where(and(eq(studyResources.id, id), eq(studyResources.studyId, studyId)));
      }
    });
    return NextResponse.json({ ok: true });
  }

  const { id, title, description } = parsed.data;
  const [updated] = await db
    .update(studyResources)
    .set({ title, description: description || null })
    .where(eq(studyResources.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(updated);
}

/** Removes a resource and its file. */
export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = studyResourceDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalid(parsed.error.flatten());

  const db = await getDb();
  const [removed] = await db.delete(studyResources).where(eq(studyResources.id, parsed.data.id)).returning();
  if (!removed) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // The row is what grants access; the file is only cleanup, so a storage
  // hiccup here shouldn't fail the removal.
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: removed.fileKey }));
  } catch (err) {
    console.error("study resource: couldn't delete the file", removed.fileKey, err);
  }
  return NextResponse.json({ ok: true });
}
