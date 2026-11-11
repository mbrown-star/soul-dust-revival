import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createPresignedUploadUrl, invalidUploadResponse } from "@/lib/r2/upload";
import { studyResourceUploadUrlSchema } from "@/lib/validation/schemas";

// Presigned PUT for a study resource PDF. The server picks the key and signs
// the link for the file's exact size. Unlike the other upload routes, only
// the key comes back, never a public URL: resources are downloaded through
// /api/study-resources/[id], which checks that the reader owns the study.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = studyResourceUploadUrlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidUploadResponse(parsed.error);

  const key = `study-resources/${crypto.randomUUID()}.pdf`;
  const { uploadUrl } = await createPresignedUploadUrl(key, parsed.data.contentType, parsed.data.size);
  return NextResponse.json({ uploadUrl, key });
}
