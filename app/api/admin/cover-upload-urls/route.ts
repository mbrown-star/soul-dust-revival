import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createPresignedUploadUrl, invalidUploadResponse } from "@/lib/r2/upload";
import { coverUploadUrlsSchema } from "@/lib/validation/schemas";

/**
 * Issues the upload links for one book-cover PDF upload. The PDF itself is
 * split in the admin's browser (lib/images/uploadBookCover.ts) -- a 300ppi
 * cover decodes to far more than a Workers isolate's 128MB -- so this route
 * only hands out short-lived presigned PUTs, all under one fresh
 * server-generated folder, never a client-supplied key, each signed for that
 * file's exact size.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = coverUploadUrlsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidUploadResponse(parsed.error);

  const id = crypto.randomUUID();
  if (parsed.data.target === "study") {
    const { sizes } = parsed.data;
    return NextResponse.json({
      front: await createPresignedUploadUrl(`study-covers/${id}/front.jpg`, "image/jpeg", sizes.front),
    });
  }

  const { sizes } = parsed.data;
  const [source, back, front] = await Promise.all([
    createPresignedUploadUrl(`book-covers/${id}/source.pdf`, "application/pdf", sizes.source),
    createPresignedUploadUrl(`book-covers/${id}/back.jpg`, "image/jpeg", sizes.back),
    createPresignedUploadUrl(`book-covers/${id}/front.jpg`, "image/jpeg", sizes.front),
  ]);
  return NextResponse.json({ source, back, front });
}
