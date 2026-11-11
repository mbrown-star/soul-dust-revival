import { and, count, eq, gt, isNull } from "drizzle-orm";
import { amazonClaims, entitlements } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import { findClaimableProduct } from "./digitalEdition";

export type ClaimResult =
  | { status: "claimed"; productTitle: string }
  | { status: "already_owned"; productTitle: string }
  | { status: "not_claimable" }
  | { status: "order_used" }
  | { status: "too_many" };

// Claims are on trust, so one account can't sweep the catalog with made-up
// numbers: past this many in a day, a reader is asked to get in touch. Far
// above one real Amazon order's worth of titles.
export const MAX_CLAIMS_PER_DAY = 10;

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  // drizzle wraps the driver error; the Postgres code sits on it or its cause.
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}

/**
 * Unlock the digital edition of a printed copy bought on Amazon, for a
 * signed-in reader. The order number has already been normalized by
 * amazonOrderNumberSchema. Granted at once, on trust: each order number can
 * claim each title once, and admins can revoke (revokeAmazonClaim).
 */
export async function claimDigitalEdition(
  db: Db,
  { userId, productId, orderNumber }: { userId: string; productId: string; orderNumber: string }
): Promise<ClaimResult> {
  const product = await findClaimableProduct(db, productId);
  if (!product) return { status: "not_claimable" };

  // Already has it (bought digital, an earlier claim, a gift): nothing to
  // grant, and no claim recorded, so this order number stays free.
  const [owned] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.productId, productId)))
    .limit(1);
  if (owned) return { status: "already_owned", productTitle: product.title };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ n: count() })
    .from(amazonClaims)
    .where(and(eq(amazonClaims.userId, userId), gt(amazonClaims.createdAt, since)));
  if ((recent?.n ?? 0) >= MAX_CLAIMS_PER_DAY) return { status: "too_many" };

  try {
    await db.transaction(async (tx) => {
      // Claim first: the unique (order number, product) constraint is the
      // check, so two simultaneous claims of one order can't both win.
      const [claim] = await tx
        .insert(amazonClaims)
        .values({ userId, productId, amazonOrderNumber: orderNumber })
        .returning({ id: amazonClaims.id });
      if (!claim) throw new Error("Claim insert returned no row");
      const [entitlement] = await tx
        .insert(entitlements)
        .values({ userId, productId, source: "amazon_claim", expiresAt: null })
        .returning({ id: entitlements.id });
      if (!entitlement) throw new Error("Entitlement insert returned no row");
      await tx.update(amazonClaims).set({ entitlementId: entitlement.id }).where(eq(amazonClaims.id, claim.id));
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "order_used" };
    throw error;
  }
  return { status: "claimed", productTitle: product.title };
}

/**
 * Take back a claim's digital access (an admin found the order number
 * doesn't match a real sale). The claim stays, marked revoked, so the order
 * number can't simply be claimed again. Returns false when there's no such
 * claim or it was already revoked.
 */
export async function revokeAmazonClaim(
  db: Db,
  { claimId, adminUserId }: { claimId: string; adminUserId: string }
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Locked so two admins revoking at once can't both delete and update.
    const [claim] = await tx
      .select({ entitlementId: amazonClaims.entitlementId })
      .from(amazonClaims)
      .where(and(eq(amazonClaims.id, claimId), isNull(amazonClaims.revokedAt)))
      .for("update");
    if (!claim) return false;
    if (claim.entitlementId) {
      await tx.delete(entitlements).where(eq(entitlements.id, claim.entitlementId));
    }
    await tx
      .update(amazonClaims)
      .set({ revokedAt: new Date(), revokedByUserId: adminUserId, entitlementId: null })
      .where(eq(amazonClaims.id, claimId));
    return true;
  });
}
