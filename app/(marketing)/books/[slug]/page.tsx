import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { AmazonBuyButton } from "@/components/commerce/AmazonBuyButton";
import { CoverGallery } from "@/components/commerce/CoverGallery";
import type { Metadata } from "next";

// Rendered dynamically per-request rather than statically at build time —
// this reads live product/post data an admin can change anytime, and a
// static build would otherwise freeze this content as of the last deploy
// (and would require a live database reachable during the build itself).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(products.slug, slug) });
  return { title: product?.title ?? "Not found" };
}

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await getDb();

  const product = await db.query.products.findFirst({
    where: eq(products.slug, slug),
  });

  if (!product || !product.active) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
        <CoverGallery
          front={product.imageUrl ? { url: product.imageUrl, alt: product.imageAlt ?? "" } : null}
          back={product.backImageUrl ? { url: product.backImageUrl, alt: product.backImageAlt ?? "" } : null}
        />

        <div>
          <p className="font-sans text-xs uppercase tracking-wide text-moss mb-2">
            {product.format === "digital" ? "Study · Unlocks in the web app" : "Book · Ships to you"}
          </p>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-4">
            {product.title}
          </h1>
          {product.description && (
            <p className="font-serif text-ink/80 mb-6 leading-relaxed">{product.description}</p>
          )}
          <p className="font-sans text-2xl font-semibold text-ink mb-6">
            ${(product.priceCents / 100).toFixed(2)}
          </p>

          <div className="flex flex-wrap gap-3">
            {product.sellOnStripe && (
              <AddToCartButton
                productId={product.id}
                title={product.title}
                priceCents={product.priceCents}
                format={product.format}
              />
            )}
            {product.amazonUrl && <AmazonBuyButton amazonUrl={product.amazonUrl} />}
          </div>

          <p className="font-sans text-sm text-moss mt-6">
            {product.format === "digital"
              ? "Digital studies require an account — you'll be prompted to sign up during checkout."
              : "Ships within a few business days. No account needed to buy a physical book alone."}
          </p>
        </div>
      </div>
    </div>
  );
}
