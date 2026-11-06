import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { splitBookCoverPdf, NoCoverImageFoundError, CoverTooLargeError } from "@/lib/images/bookCover";
import { r2, R2_BUCKET, r2PublicUrl } from "@/lib/r2/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs"; // unpdf/photon need Node-style binary handling, not the edge runtime

// Same ceiling as the product cover-PDF route and the .docx/.pdf study
// importer -- generous for a print-cover PDF, bounds worst-case processing
// time from an oversized upload.
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Takes an admin-uploaded full-wrap book cover PDF (back cover + spine +
 * front cover, as KDP's print-cover template produces) -- the same source
 * file already uploaded for the study's linked physical product, when it
 * has one -- and extracts just the front cover for the study's own cover
 * image. Unlike the product cover-PDF route, a study has no back-cover
 * concept, so only the front crop is kept; the back crop and the source PDF
 * itself are discarded rather than stored. Returns the front image's public
 * URL for the study form to populate via the normal /api/admin/studies
 * save -- this route does not touch the DB itself.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "invalid_input", message: "Missing file" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "invalid_input", message: "File must be a PDF" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: "File must be under 25MB." }, { status: 400 });
  }

  const pdfBuffer = Buffer.from(await file.arrayBuffer());

  let split: { back: Uint8Array; front: Uint8Array };
  try {
    split = await splitBookCoverPdf(new Uint8Array(pdfBuffer));
  } catch (err) {
    if (err instanceof NoCoverImageFoundError) {
      return NextResponse.json({ error: "no_cover_image_found", message: err.message }, { status: 400 });
    }
    if (err instanceof CoverTooLargeError) {
      return NextResponse.json({ error: "cover_too_large", message: err.message }, { status: 400 });
    }
    // A corrupt/non-parseable PDF throws from inside pdf.js itself (not one
    // of the typed errors above) -- still the admin's bad input, not a
    // server error, so it gets the same clean 400 rather than a raw 500.
    return NextResponse.json(
      { error: "invalid_pdf", message: "Couldn't read that file as a PDF." },
      { status: 400 }
    );
  }

  // Grouped under one random folder id (not derived from the uploaded
  // filename) purely for readability when browsing the bucket -- the key is
  // still fully server-generated, never client-supplied.
  const id = crypto.randomUUID();

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: `study-covers/${id}/front.jpg`,
      Body: Buffer.from(split.front),
      ContentType: "image/jpeg",
    })
  );

  return NextResponse.json({
    coverImageUrl: r2PublicUrl(`study-covers/${id}/front.jpg`),
  });
}
