import { getDb } from "@/lib/db/client";
import { products, bundleItems } from "@/lib/db/schema";
import { and, eq, ne, or, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BundleForm } from "@/components/admin/BundleForm";

export default async function EditBundlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const bundle = await db.query.products.findFirst({ where: and(eq(products.id, id), eq(products.type, "bundle")) });
  if (!bundle) redirect("/admin/bundles");

  const items = await db
    .select({ componentProductId: bundleItems.componentProductId })
    .from(bundleItems)
    .where(eq(bundleItems.bundleProductId, id))
    .orderBy(bundleItems.orderIndex);
  const componentProductIds = items.map((i) => i.componentProductId);

  // Includes every active product, plus this bundle's current components
  // even if one of those has since been deactivated -- otherwise re-saving
  // this form would silently drop it instead of leaving it to the admin's
  // own judgment.
  const candidates = await db
    .select({
      id: products.id,
      title: products.title,
      type: products.type,
      format: products.format,
      priceCents: products.priceCents,
      digitalPriceCents: products.digitalPriceCents,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(
      and(
        ne(products.type, "bundle"),
        or(eq(products.active, true), componentProductIds.length > 0 ? inArray(products.id, componentProductIds) : undefined)
      )
    );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Edit bundle</h1>
      <BundleForm
        initial={{
          id: bundle.id,
          title: bundle.title,
          slug: bundle.slug,
          description: bundle.description ?? "",
          priceCents: bundle.priceCents,
          imageUrl: bundle.imageUrl,
          imageAlt: bundle.imageAlt ?? "",
          format: bundle.format as "physical" | "digital",
          active: bundle.active,
          featured: bundle.featured,
          componentProductIds,
        }}
        candidates={candidates}
      />
    </div>
  );
}
