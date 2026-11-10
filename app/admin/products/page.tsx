import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { desc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { CreateMenu } from "@/components/admin/CreateMenu";

export default async function AdminProductsPage() {
  const db = await getDb();
  // Safety cap, not real pagination -- this list is admin-curated and
  // realistically stays in the dozens, but nothing should fetch unbounded.
  // Excludes bundles (type: "bundle") -- they're products.rows too, but get
  // their own dedicated /admin/bundles list rather than mixing into this one.
  const allProducts = await db
    .select()
    .from(products)
    .where(ne(products.type, "bundle"))
    .orderBy(desc(products.createdAt))
    .limit(100);
  // Queried separately (not derived from the capped list above) so the
  // count stays correct even past the 100-row display cap.
  const featuredProducts = await db.query.products.findMany({
    where: eq(products.featured, true),
    columns: { id: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Products</h1>
          <p className="text-sm text-moss">{featuredProducts.length}/8 featured on the homepage</p>
        </div>
        <CreateMenu
          label="Add product"
          items={[
            { label: "New product", href: "/admin/products/new" },
            { label: "New bundle", href: "/admin/bundles/new" },
          ]}
        />
      </div>

      <div className="divide-y border rounded-lg">
        {allProducts.map((p) => (
          <Link
            key={p.id}
            href={`/admin/products/${p.id}`}
            className="flex items-center gap-4 p-4 hover:bg-moss/5"
          >
            {p.imageUrl ? (
              <Image
                src={p.imageUrl}
                alt=""
                width={0}
                height={0}
                sizes="48px"
                className="h-12 w-auto rounded"
              />
            ) : (
              <div className="w-12 h-12 bg-moss/10 rounded" />
            )}
            <div className="flex-1">
              <p className="font-medium flex items-center gap-2">
                {p.title}
                {/* Same differentiator the Study list already has (and the
                    same accessible-contrast tokens) -- a plain book has
                    nothing to distinguish, so it gets no badge at all rather
                    than a redundant "Book" pill. */}
                {p.kind !== "book" && (
                  <span
                    data-testid="product-kind-badge"
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      p.kind === "study" ? "bg-ember-700/10 text-ink" : "bg-moss/10 text-moss"
                    }`}
                  >
                    {p.kind === "study" ? "Study" : "Devotional"}
                  </span>
                )}
                {p.featured && (
                  <span className="text-xs font-medium bg-gold/20 text-gold-700 rounded-full px-2 py-0.5">
                    Featured
                  </span>
                )}
              </p>
              <p className="text-sm text-moss">
                {p.format} · ${(p.priceCents / 100).toFixed(2)}
                {p.format === "both" && p.digitalPriceCents != null && ` / $${(p.digitalPriceCents / 100).toFixed(2)} digital`}
                {" · "}
                {[p.sellOnStripe && "Stripe", p.amazonUrl && "Amazon"].filter(Boolean).join(" + ")}
                {p.bookBinding && ` · ${p.bookBinding === "hardback" ? "Hardback" : "Softback"}`}
                {!p.active && " · inactive"}
              </p>
            </div>
          </Link>
        ))}
        {allProducts.length === 0 && (
          <p className="p-4 text-moss">No products yet.</p>
        )}
      </div>
    </div>
  );
}
