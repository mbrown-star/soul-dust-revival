import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { studies, lessons, contentBlocks } from "@/lib/db/schema";
import { parseDocxToHtml } from "@/lib/import/parseDocx";
import { parsePdfToText } from "@/lib/import/parsePdf";
import { splitHtmlByHeadings, splitPlainTextByHeadings } from "@/lib/import/splitIntoLessons";
import { r2, R2_BUCKET, r2PublicUrl } from "@/lib/r2/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { studyImportFieldsSchema } from "@/lib/validation/schemas";
import { sanitizeHtml } from "@/lib/sanitize/html";

export const runtime = "nodejs"; // mammoth/pdf-parse need Node APIs, not the edge runtime

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — generous for a study document, bounds parse time

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  const parsed = studyImportFieldsSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    productId: formData.get("productId"),
  });

  if (!file || !parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.success ? "Missing file" : parsed.error.flatten() }, { status: 400 });
  }
  const { title, slug, productId } = parsed.data;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: "File must be under 25MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const isDocx = file.name.toLowerCase().endsWith(".docx");
  const isPdf = file.name.toLowerCase().endsWith(".pdf");

  if (!isDocx && !isPdf) {
    return NextResponse.json({ error: "Only .docx and .pdf files are supported" }, { status: 400 });
  }

  // Parse into lessons using each format's own splitting strategy.
  const importedLessons = isDocx
    ? splitHtmlByHeadings(await parseDocxToHtml(buffer))
    : splitPlainTextByHeadings(await parsePdfToText(buffer));

  // Store the original file in R2 for reference/audit. Key is fully
  // server-generated (random UUID + validated extension only) rather than
  // incorporating the raw uploaded filename, to avoid any path-traversal or
  // injection risk from user-controlled file names.
  const extension = isDocx ? "docx" : "pdf";
  const key = `study-sources/${crypto.randomUUID()}.${extension}`;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  );
  const sourceFileUrl = r2PublicUrl(key);
  const db = await getDb();

  // Create the study, unpublished by default — imports need human review before going live.
  const [study] = await db
    .insert(studies)
    .values({
      productId,
      title,
      slug,
      published: false,
      sourceFileUrl,
      sourceFileName: file.name.slice(0, 200), // stored for display only, never used in a path
    })
    .returning();

  if (!study) {
    return NextResponse.json({ error: "study_creation_failed" }, { status: 500 });
  }

  // Batched as two multi-row inserts rather than one DB round-trip per lesson
  // — a real study document can split into dozens of heading-delimited
  // lessons, so the old per-lesson loop was a genuine N+1 on this route's hot
  // path (parse + N*2 sequential inserts). Lessons are matched back up with
  // their source text by `orderIndex` rather than by trusting RETURNING to
  // preserve insertion order, which Postgres doesn't formally guarantee.
  if (importedLessons.length > 0) {
    const insertedLessons = await db
      .insert(lessons)
      .values(
        importedLessons.map((importedLesson, i) => ({
          studyId: study.id,
          title: importedLesson.title.slice(0, 200),
          orderIndex: i,
          published: false,
        }))
      )
      .returning();

    const lessonsByOrderIndex = new Map(insertedLessons.map((lesson) => [lesson.orderIndex, lesson]));

    const contentBlockValues = importedLessons.flatMap((importedLesson, i) => {
      const lesson = lessonsByOrderIndex.get(i);
      if (!lesson) return []; // skip if this row somehow failed to insert

      return [
        {
          lessonId: lesson.id,
          orderIndex: 0,
          type: "text" as const,
          // Sanitize extracted document HTML before storing — imported
          // documents are a form of untrusted input even when uploaded by an admin.
          body: sanitizeHtml(importedLesson.bodyHtml),
        },
      ];
    });

    if (contentBlockValues.length > 0) {
      await db.insert(contentBlocks).values(contentBlockValues);
    }
  }

  return NextResponse.json({ studyId: study.id, lessonCount: importedLessons.length });
}
