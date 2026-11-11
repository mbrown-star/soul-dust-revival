import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { amazonClaimRevokeSchema } from "@/lib/validation/schemas";
import { revokeAmazonClaim } from "@/lib/commerce/amazonClaims";

/** Revoke a claim's digital access (/admin/reports/amazon-claims). */
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = amazonClaimRevokeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const db = await getDb();
  const revoked = await revokeAmazonClaim(db, { claimId: parsed.data.id, adminUserId: session.userId });
  if (!revoked) {
    return NextResponse.json({ error: "not_found", message: "That claim doesn't exist or was already revoked." }, { status: 404 });
  }
  revalidatePath("/library");
  revalidatePath("/admin/reports/amazon-claims");
  return NextResponse.json({ ok: true });
}
