import { eq, inArray } from "drizzle-orm";
import { products } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * A study's own `title` column isn't always a clean, customer-facing name --
 * some were imported with the raw source filename left in place (see
 * CLAUDE.md's 2026-11-09 entry on the real Psalms devotional's title). The
 * linked product's title is the one actually shown on the storefront and at
 * checkout, so every place a study's name is shown to a customer (My
 * Library, the study's own listing page) should show that instead.
 *
 * Deliberately NOT used for components/study/StudyLessonView.tsx's
 * `bookLabel` prop -- its own `deriveBookLabel()` strips a documented
 * "Soul Dust Revival " prefix off `study.title` specifically, a convention
 * tied to the study's own title, not the product's.
 */
export async function getDisplayStudyTitle(
  db: Db,
  study: { title: string; productId: string }
): Promise<string> {
  const product = await db.query.products.findFirst({ where: eq(products.id, study.productId) });
  return product?.title ?? study.title;
}

/**
 * Batched version for a list of studies, avoiding one query per row. Keyed
 * by the study's own id (not productId) -- a product/study link should
 * always be one-to-one in practice, but nothing in the schema enforces that
 * as a unique constraint, so this doesn't assume it.
 */
export async function getDisplayStudyTitles(
  db: Db,
  studies: { id: string; title: string; productId: string }[]
): Promise<Map<string, string>> {
  const productIds = [...new Set(studies.map((s) => s.productId))];
  const rows =
    productIds.length === 0
      ? []
      : await db.select({ id: products.id, title: products.title }).from(products).where(inArray(products.id, productIds));
  const titleByProductId = new Map(rows.map((r) => [r.id, r.title]));

  const result = new Map<string, string>();
  for (const study of studies) {
    result.set(study.id, titleByProductId.get(study.productId) ?? study.title);
  }
  return result;
}
