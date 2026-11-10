import { getDb } from "@/lib/db/client";
import { entitlements } from "@/lib/db/schema";
import { and, eq, or, isNull, gt } from "drizzle-orm";
import { getRoleForSession } from "@/lib/admin/guard";
import type { Session } from "@/lib/auth/session";

/**
 * Single source of truth for "does this user have access to this product".
 * Every gated route, API handler, and signed-URL generator should call this
 * rather than checking orders directly.
 */
export async function hasEntitlement(userId: string, productId: string): Promise<boolean> {
  const now = new Date();
  const db = await getDb();

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

export type StudyAccess = {
  /** May open the study's reader at all. */
  allowed: boolean;
  /**
   * An admin previewing: may also open unpublished studies and lessons. Admins
   * already control all of this content in the admin console, so reading it
   * in the reader grants nothing new; anything they save while previewing
   * (answers, progress) is scoped to their own account like anyone else's.
   */
  isAdminPreview: boolean;
};

/**
 * Reader access to a study, gated by its linked product: an entitlement, or
 * the admin role (to preview their own work). Every reader page and reader
 * API route uses this rather than combining the two checks itself.
 */
export async function getStudyAccess(session: Session, studyProductId: string): Promise<StudyAccess> {
  const isAdminPreview = (await getRoleForSession(session)) === "admin";
  if (isAdminPreview) return { allowed: true, isAdminPreview };
  return { allowed: await hasEntitlement(session.userId, studyProductId), isAdminPreview };
}
