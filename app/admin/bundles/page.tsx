import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";

export default async function AdminBundlesPage() {
  const db = await getDb();
  const allBundles = await db
    .select()
    .from(products)
    .where(eq(products.type, "bundle"))
    .orderBy(desc(products.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Bundles</h1>
        <Link href="/admin/bundles/new" className="inline-block bg-ink text-white rounded-lg px-4 py-2 text-center">
          Add bundle
        </Link>
      </div>

      <div className="divide-y border rounded-lg">
        {allBundles.map((b) => (
          <Link key={b.id} href={`/admin/bundles/${b.id}`} className="flex items-center gap-4 p-4 hover:bg-moss/5">
            {b.imageUrl ? (
              <Image src={b.imageUrl} alt="" width={0} height={0} sizes="48px" className="h-12 w-auto rounded" />
            ) : (
              <div className="w-12 h-12 bg-moss/10 rounded" />
            )}
            <div className="flex-1">
              <p className="font-medium flex items-center gap-2">
                {b.title}
                {b.featured && (
                  <span className="text-xs font-medium bg-gold/20 text-gold-700 rounded-full px-2 py-0.5">
                    Featured
                  </span>
                )}
              </p>
              <p className="text-sm text-moss">
                {b.format === "physical"
                  ? `Ships · $${(b.priceCents / 100).toFixed(2)}`
                  : b.format === "digital"
                  ? `Digital access · $${(b.priceCents / 100).toFixed(2)}`
                  : `Ships $${(b.priceCents / 100).toFixed(2)} · Digital $${((b.digitalPriceCents ?? 0) / 100).toFixed(2)}`}
                {!b.active && " · inactive"}
              </p>
            </div>
          </Link>
        ))}
        {allBundles.length === 0 && <p className="p-4 text-moss">No bundles yet.</p>}
      </div>
    </div>
  );
}
