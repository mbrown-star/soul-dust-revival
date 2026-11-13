import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { BundleForm } from "@/components/admin/BundleForm";

export default async function NewBundlePage() {
  const db = await getDb();
  const candidates = await db
    .select({
      id: products.id,
      title: products.title,
      type: products.type,
      format: products.format,
      priceCents: products.priceCents,
      digitalPriceCents: products.digitalPriceCents,
      imageUrl: products.imageUrl,
      kind: products.kind,
      comingSoon: products.comingSoon,
    })
    .from(products)
    .where(and(ne(products.type, "bundle"), eq(products.active, true)));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Add bundle</h1>
      <BundleForm candidates={candidates} />
    </div>
  );
}
