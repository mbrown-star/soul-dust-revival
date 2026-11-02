import { db } from "@/lib/db/client";
import { entitlements } from "@/lib/db/schema";
import { and, eq, or, isNull, gt } from "drizzle-orm";

/**
 * Single source of truth for "does this user have access to this product".
 * Every gated route, API handler, and signed-URL generator should call this
 * rather than checking orders directly.
 */
export async function hasEntitlement(userId: string, productId: string): Promise<boolean> {
  const now = new Date();

  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.productId, productId),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now))
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Convenience helper for gating a study by its linked product.
 */
export async function hasStudyAccess(userId: string, studyProductId: string): Promise<boolean> {
  return hasEntitlement(userId, studyProductId);
}
