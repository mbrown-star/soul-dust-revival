import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createPresignedUploadUrl } from "@/lib/r2/upload";
import { resourceFileUploadUrlSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = resourceFileUploadUrlSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { uploadUrl, publicUrl } = await createPresignedUploadUrl(parsed.data.key, parsed.data.contentType);
  return NextResponse.json({ uploadUrl, publicUrl });
}
