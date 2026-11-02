import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { createStreamDirectUploadUrl } from "@/lib/stream/upload";

export async function POST() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await createStreamDirectUploadUrl();
  return NextResponse.json(result);
}
