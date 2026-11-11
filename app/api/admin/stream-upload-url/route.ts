import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createStreamTusUpload } from "@/lib/stream/upload";
import { streamUploadSchema } from "@/lib/validation/schemas";

/**
 * Reserves a resumable upload for one video/audio file (admin only). The
 * browser uploads the file to the returned one-time URL directly.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = streamUploadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    return NextResponse.json(await createStreamTusUpload(parsed.data));
  } catch (err) {
    console.error("Stream upload reservation failed", err);
    return NextResponse.json({ error: "upstream", message: "The video host didn't accept the upload. Try again in a moment." }, { status: 502 });
  }
}
