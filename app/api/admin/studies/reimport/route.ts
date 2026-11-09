import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import {
  studies,
  lessons,
  contentBlocks,
  lessonProgress,
  responses,
  orderItems,
  entitlements,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { parseStudyDocument, toContentBlockInserts } from "@/lib/import/parseStudyDocument";
import { r2, R2_BUCKET, r2PublicUrl, IMMUTABLE_CACHE_CONTROL } from "@/lib/r2/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { studyReimportFieldsSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs"; // mammoth/pdf-parse need Node APIs, not the edge runtime

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // same ceiling as the create-path importer

/**
 * Re-imports a new/revised document into an EXISTING study, replacing every
 * one of its lessons (and their content blocks) wholesale -- "upload the
 * wrong file" or "the manuscript was revised" has no sensible partial-merge
 * story the way lib/import/splitIntoLessons.ts's own title-matching
 * reprocess script has for re-parsing the *same* source with a fixed parser
 * (scripts/reprocess-study-lessons.ts): a genuinely different document can
 * freely add, remove, rename, or reorder sections, so there's nothing
 * reliable to match the old lessons against.
 *
 * Refuses (409) under the exact same condition the study DELETE route
 * already refuses a delete -- the linked product having real order or
 * entitlement history -- since replacing the lessons out from under an
 * already-sold study would silently orphan a paying customer's saved
 * lesson_progress/responses. Deactivating first (or just not reusing this
 * study once it's been sold) is the same answer DELETE already gives.
 *
 * The study itself (and every freshly-inserted lesson) is set back to
 * unpublished, mirroring the create-path importer's own "review before
 * publishing" rule -- a reimport is exactly as unreviewed as a fresh import.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  const parsed = studyReimportFieldsSchema.safeParse({ studyId: formData.get("studyId") });
  if (!file || !parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.success ? "Missing file" : parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { studyId } = parsed.data;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: "File must be under 25MB." }, { status: 400 });
  }

  const isDocx = file.name.toLowerCase().endsWith(".docx");
  const isPdf = file.name.toLowerCase().endsWith(".pdf");
  if (!isDocx && !isPdf) {
    return NextResponse.json({ error: "Only .docx and .pdf files are supported" }, { status: 400 });
  }

  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.id, studyId) });
  if (!study) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Same safety check as the study DELETE route -- see this route's own doc
  // comment above for why.
  if (study.productId) {
    const [linkedOrderItem] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.productId, study.productId))
      .limit(1);
    if (linkedOrderItem) {
      return NextResponse.json(
        { error: "has_orders", message: "This study's product has order history and can't be reimported." },
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
        {
          error: "has_entitlements",
          message: "This study's product has been granted to a user and can't be reimported.",
        },
        { status: 409 }
      );
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const importedLessons = await parseStudyDocument(buffer, { isDocx, kind: study.kind });

  const extension = isDocx ? "docx" : "pdf";
  const key = `study-sources/${crypto.randomUUID()}.${extension}`;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    })
  );
  const sourceFileUrl = r2PublicUrl(key);

  await db.transaction(async (tx) => {
    const existingLessons = await tx.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, studyId));
    const existingLessonIds = existingLessons.map((l) => l.id);

    if (existingLessonIds.length > 0) {
      const existingBlocks = await tx
        .select({ id: contentBlocks.id })
        .from(contentBlocks)
        .where(inArray(contentBlocks.lessonId, existingLessonIds));
      const existingBlockIds = existingBlocks.map((b) => b.id);

      if (existingBlockIds.length > 0) {
        await tx.delete(responses).where(inArray(responses.contentBlockId, existingBlockIds));
      }
      await tx.delete(lessonProgress).where(inArray(lessonProgress.lessonId, existingLessonIds));
      await tx.delete(contentBlocks).where(inArray(contentBlocks.lessonId, existingLessonIds));
      await tx.delete(lessons).where(eq(lessons.studyId, studyId));
    }

    await tx
      .update(studies)
      .set({ sourceFileUrl, sourceFileName: file.name.slice(0, 200), published: false })
      .where(eq(studies.id, studyId));

    if (importedLessons.length === 0) return;

    const insertedLessons = await tx
      .insert(lessons)
      .values(
        importedLessons.map((importedLesson, i) => ({
          studyId,
          title: importedLesson.title.slice(0, 200),
          orderIndex: i,
          published: false,
        }))
      )
      .returning();

    const lessonsByOrderIndex = new Map(insertedLessons.map((lesson) => [lesson.orderIndex, lesson]));

    const contentBlockValues = importedLessons.flatMap((importedLesson, i) => {
      const lesson = lessonsByOrderIndex.get(i);
      if (!lesson) return [];
      return toContentBlockInserts(lesson.id, importedLesson.blocks);
    });

    if (contentBlockValues.length > 0) {
      await tx.insert(contentBlocks).values(contentBlockValues);
    }
  });

  return NextResponse.json({ studyId, lessonCount: importedLessons.length });
}
