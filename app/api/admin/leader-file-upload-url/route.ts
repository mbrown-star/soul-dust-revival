import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createPresignedUploadUrl, invalidUploadResponse } from "@/lib/r2/upload";
import { resourceFileUploadUrlSchema } from "@/lib/validation/schemas";

// Presigned PUT for a leader resource PDF. The server picks the key and signs
// the link for the file's exact size.
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = resourceFileUploadUrlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return invalidUploadResponse(parsed.error);

  const key = `leader-resources/${crypto.randomUUID()}.pdf`;
  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(key, parsed.data.contentType, parsed.data.size);
  return NextResponse.json({ uploadUrl, publicUrl });
}
