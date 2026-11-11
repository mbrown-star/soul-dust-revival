import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { products, studies, bundleItems } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

/**
 * Buying a printed copy includes its digital edition (the study it unlocks in
 * the app). A product "has a digital edition" when a study is linked to it,
 * published or not: a draft's owners see it the moment it's published.
 *
 * Returns the subset of `productIds` that have one.
 */
export async function productIdsWithDigitalEdition(db: Db, productIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ productId: studies.productId })
    .from(studies)
    .where(inArray(studies.productId, ids));
  return new Set(rows.map((r) => r.productId));
}

/** Every component of the given bundles (other product ids are ignored). */
export async function bundleComponentIds(db: Db, bundleProductIds: string[]): Promise<string[]> {
  if (bundleProductIds.length === 0) return [];
  const rows = await db
    .select({ id: bundleItems.componentProductId })
    .from(bundleItems)
    .where(inArray(bundleItems.bundleProductId, bundleProductIds));
  return rows.map((r) => r.id);
}

/**
 * Whether buying these products (in any format) brings something to read in
 * the app: a linked study of their own, or of a bundle's components.
 */
export async function includesDigitalEdition(db: Db, productIds: string[]): Promise<boolean> {
  const all = [...productIds, ...(await bundleComponentIds(db, productIds))];
  return (await productIdsWithDigitalEdition(db, all)).size > 0;
}

export type ClaimableProduct = { id: string; slug: string; title: string };

/**
 * Titles a printed-on-Amazon buyer can claim the digital edition of on
 * /claim: active, sold on Amazon with a live link, and with a linked study.
 * Bundles are never sold on Amazon, so they never appear here.
 */
export async function claimableProducts(db: Db): Promise<ClaimableProduct[]> {
  const rows = await db
    .selectDistinct({ id: products.id, slug: products.slug, title: products.title })
    .from(products)
    .innerJoin(studies, eq(studies.productId, products.id))
    .where(and(eq(products.active, true), eq(products.sellOnAmazon, true), isNotNull(products.amazonUrl)))
    .orderBy(asc(products.title));
  return rows;
}

/** One claimable product, or null when this product can't be claimed. */
export async function findClaimableProduct(db: Db, productId: string): Promise<ClaimableProduct | null> {
  const [row] = await db
    .select({ id: products.id, slug: products.slug, title: products.title })
    .from(products)
    .innerJoin(studies, eq(studies.productId, products.id))
    .where(
      and(
        eq(products.id, productId),
        eq(products.active, true),
        eq(products.sellOnAmazon, true),
        isNotNull(products.amazonUrl)
      )
    )
    .limit(1);
  return row ?? null;
}
