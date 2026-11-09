import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { productEyebrowLabel } from "@/lib/commerce/productEyebrow";
import { CoverThumbnail } from "@/components/commerce/CoverThumbnail";

// Rendered dynamically per-request rather than statically at build time —
// this reads live product/post data an admin can change anytime, and a
// static build would otherwise freeze this content as of the last deploy
// (and would require a live database reachable during the build itself).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Books & Studies",
};

export default async function BooksPage() {
  const db = await getDb();
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true))
    .orderBy(desc(products.createdAt));

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-2">
        Books &amp; Studies
      </h1>
      <p className="font-serif text-moss mb-10 max-w-xl">
        Printed books ship to your door. Studies unlock in the web app the moment you buy.
      </p>

      {allProducts.length === 0 ? (
        <p className="font-serif text-moss">New studies and books are on the way.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {allProducts.map((p) => (
            <Link
              key={p.id}
              href={`/books/${p.slug}`}
              className="group focus:outline-none focus:ring-2 focus:ring-ink rounded-lg"
            >
              <div className="mb-3">
                <CoverThumbnail
                  imageUrl={p.imageUrl}
                  imageAlt={p.imageAlt}
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                />
              </div>
              <p className="font-sans text-xs uppercase tracking-wide text-moss mb-1">
                {productEyebrowLabel({
                  type: p.type,
                  kind: p.kind,
                  format: p.format,
                  bookBinding: p.bookBinding,
                })}
              </p>
              <h2 className="font-display font-semibold text-ink group-hover:text-moss">
                {p.title}
              </h2>
              <p className="font-sans text-sm text-moss mt-1">${(p.priceCents / 100).toFixed(2)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
