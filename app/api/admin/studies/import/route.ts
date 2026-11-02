import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { db } from "@/lib/db/client";
import { studies, lessons, contentBlocks } from "@/lib/db/schema";
import { parseDocxToHtml } from "@/lib/import/parseDocx";
import { parsePdfToText } from "@/lib/import/parsePdf";
import { splitHtmlByHeadings, splitPlainTextByHeadings } from "@/lib/import/splitIntoLessons";
import { r2, R2_BUCKET, r2PublicUrl } from "@/lib/r2/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { studyImportFieldsSchema } from "@/lib/validation/schemas";
import DOMPurify from "isomorphic-dompurify";

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

  for (let i = 0; i < importedLessons.length; i++) {
    const importedLesson = importedLessons[i];
    if (!importedLesson) continue; // unreachable given the loop bound, but keeps TS honest

    const [lesson] = await db
      .insert(lessons)
      .values({
        studyId: study.id,
        title: importedLesson.title.slice(0, 200),
        orderIndex: i,
        published: false,
      })
      .returning();

    if (!lesson) continue; // skip content-block creation if this row somehow failed to insert

    await db.insert(contentBlocks).values({
      lessonId: lesson.id,
      orderIndex: 0,
      type: "text",
      // Sanitize extracted document HTML before storing — imported documents
      // are a form of untrusted input even when uploaded by an admin.
      body: DOMPurify.sanitize(importedLesson.bodyHtml),
    });
  }

  return NextResponse.json({ studyId: study.id, lessonCount: importedLessons.length });
}
