import { eq } from "drizzle-orm";
import { products } from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";

// Shown in the homepage's "Featured content" section, which has room for up
// to this many tiles. Applies across every product type (including
// bundles — they're `products` rows too, and the homepage query has no
// type filter). "No more than N featured" is a cross-row count, so it can't
// be expressed in a per-row Zod schema — checked here instead, against the
// current DB state, shared by both app/api/admin/products/route.ts and
// app/api/admin/bundles/route.ts rather than each keeping its own copy.
export const MAX_FEATURED_PRODUCTS = 8;

export async function featuredCount(db: Db, excludeProductId?: string): Promise<number> {
  const featured = await db.query.products.findMany({
    where: eq(products.featured, true),
    columns: { id: true },
  });
  return excludeProductId ? featured.filter((p) => p.id !== excludeProductId).length : featured.length;
}
