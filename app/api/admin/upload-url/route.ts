import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createPresignedUploadUrl, invalidUploadResponse } from "@/lib/r2/upload";
import { IMAGE_EXTENSIONS, uploadUrlSchema } from "@/lib/validation/schemas";

// Presigned PUT for one image (product, bundle, social post, or lesson
// content). The server picks the key -- a fresh UUID in the folder for what
// the image is for -- and signs the link for the file's exact size.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = uploadUrlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidUploadResponse(parsed.error);

  const { folder, contentType, size } = parsed.data;
  const key = `${folder}/${crypto.randomUUID()}.${IMAGE_EXTENSIONS[contentType]}`;
  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(key, contentType, size);
  return NextResponse.json({ uploadUrl, publicUrl });
}
