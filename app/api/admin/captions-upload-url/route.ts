import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createPresignedUploadUrl, invalidUploadResponse } from "@/lib/r2/upload";
import { captionsUploadUrlSchema } from "@/lib/validation/schemas";

// Presigned PUT for a video block's WebVTT captions file -- separate from
// /api/admin/upload-url so that endpoint's image-only allowlist stays narrow.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = captionsUploadUrlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidUploadResponse(parsed.error);

  const key = `captions/${crypto.randomUUID()}.vtt`;
  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(key, parsed.data.contentType, parsed.data.size);
  return NextResponse.json({ uploadUrl, publicUrl });
}
