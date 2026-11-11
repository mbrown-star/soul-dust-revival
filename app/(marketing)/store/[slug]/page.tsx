import { getDb } from "@/lib/db/client";
import { products, bundleItems } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AddToCartButton } from "@/components/commerce/AddToCartButton";
import { AmazonPurchase } from "@/components/commerce/AmazonBuyButton";
import { ComingSoonNotice } from "@/components/commerce/ComingSoonNotice";
import { CoverGallery } from "@/components/commerce/CoverGallery";
import { coverAspectRatio } from "@/lib/images/coverAspectRatio";
import { productEyebrowLabel } from "@/lib/commerce/productEyebrow";
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

  // A bundle's own purchase (master cover, price(s), AddToCartButton(s)) is
  // handled by the exact same format-based branches below as any other
  // product, format "both" included -- a bundle just never has its own
  // amazonUrl/sellOnStripe (see bundleSchema). This is just the extra
  // "what's included" list, each component purchasable on its own through
  // its own existing buttons.
  const components =
    product.type === "bundle"
      ? await db
          .select({
            id: products.id,
            slug: products.slug,
            title: products.title,
            format: products.format,
            priceCents: products.priceCents,
            digitalPriceCents: products.digitalPriceCents,
            imageUrl: products.imageUrl,
            imageAlt: products.imageAlt,
            imageWidth: products.imageWidth,
            imageHeight: products.imageHeight,
            amazonUrl: products.amazonUrl,
            sellOnStripe: products.sellOnStripe,
            sellOnAmazon: products.sellOnAmazon,
            comingSoon: products.comingSoon,
          })
          .from(bundleItems)
          .innerJoin(products, eq(bundleItems.componentProductId, products.id))
          .where(eq(bundleItems.bundleProductId, product.id))
          .orderBy(asc(bundleItems.orderIndex))
      : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
        <CoverGallery
          front={
            product.imageUrl
              ? { url: product.imageUrl, alt: product.imageAlt ?? "", width: product.imageWidth, height: product.imageHeight }
              : null
          }
          back={
            product.backImageUrl
              ? {
                  url: product.backImageUrl,
                  alt: product.backImageAlt ?? "",
                  width: product.backImageWidth,
                  height: product.backImageHeight,
                }
              : null
          }
        />

        <div>
          <p className="font-sans text-xs uppercase tracking-wide text-moss mb-2">
            {productEyebrowLabel({
              type: product.type,
              kind: product.kind,
              format: product.format,
            })}
          </p>
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-4">
            {product.title}
          </h1>
          {product.description && (
            <p className="font-serif text-ink/80 mb-6 leading-relaxed">{product.description}</p>
          )}

          {product.comingSoon ? (
            <ComingSoonNotice />
          ) : product.format === "both" ? (
            <div className="space-y-6">
              <div className="border border-moss/20 rounded-lg p-4">
                <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-moss mb-2">
                  {product.type === "bundle" ? "Ships to you" : "Printed book"}
                </h2>
                <p className="font-sans text-xl font-semibold text-ink mb-3">
                  ${(product.priceCents / 100).toFixed(2)}
                </p>
                <div className="flex flex-wrap gap-3">
                  {product.sellOnStripe && (
                    <AddToCartButton
                      productId={product.id}
                      title={product.title}
                      priceCents={product.priceCents}
                      format="physical"
                      variant="physical"
                      label={product.type === "bundle" ? "Buy the bundle" : "Buy the book"}
                    />
                  )}
                  <AmazonPurchase sellOnAmazon={product.sellOnAmazon} amazonUrl={product.amazonUrl} />
                </div>
                <p className="font-sans text-sm text-moss mt-3">
                  {product.type === "bundle"
                    ? "Ships within a few business days. No account needed to buy the physical bundle alone."
                    : "Ships within a few business days. No account needed to buy the printed book alone."}
                </p>
              </div>

              <div className="border border-moss/20 rounded-lg p-4">
                <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-moss mb-2">
                  Digital access
                </h2>
                <p className="font-sans text-xl font-semibold text-ink mb-3">
                  ${((product.digitalPriceCents ?? 0) / 100).toFixed(2)}
                </p>
                <AddToCartButton
                  productId={product.id}
                  title={product.title}
                  priceCents={product.digitalPriceCents ?? 0}
                  format="digital"
                  variant="digital"
                  label="Buy digital access"
                />
                <p className="font-sans text-sm text-moss mt-3">
                  Digital access requires an account — you&apos;ll be prompted to sign up during checkout.
                </p>
              </div>
            </div>
          ) : (
            <>
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
                <AmazonPurchase sellOnAmazon={product.sellOnAmazon} amazonUrl={product.amazonUrl} />
              </div>

              <p className="font-sans text-sm text-moss mt-6">
                {product.type === "bundle"
                  ? "One purchase, everything below included."
                  : product.format === "digital"
                  ? "Digital studies require an account — you'll be prompted to sign up during checkout."
                  : "Ships within a few business days. No account needed to buy a physical book alone."}
              </p>
            </>
          )}
        </div>
      </div>

      {product.type === "bundle" && components.length > 0 && (
        <div className="mt-16">
          <h2 className="font-display font-bold text-2xl text-ink mb-6">What&apos;s included</h2>
          <div className="divide-y border-t border-b border-moss/20">
            {components.map((component) => (
              <div key={component.id} className="flex items-center gap-4 py-5">
                {component.imageUrl ? (
                  <div
                    className="relative h-16 flex-shrink-0 rounded overflow-hidden"
                    style={{ aspectRatio: coverAspectRatio(component.imageWidth, component.imageHeight) }}
                  >
                    <Image src={component.imageUrl} alt={component.imageAlt ?? ""} fill sizes="64px" className="object-cover" />
                  </div>
                ) : (
                  <div className="w-14 h-14 bg-moss/10 rounded flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <Link href={`/store/${component.slug}`} className="font-sans font-semibold text-ink hover:text-moss">
                    {component.title}
                  </Link>
                  <p className="font-sans text-sm text-moss">
                    {component.comingSoon
                      ? "Coming soon"
                      : component.format === "both"
                      ? `$${(component.priceCents / 100).toFixed(2)} printed · $${((component.digitalPriceCents ?? 0) / 100).toFixed(2)} digital`
                      : `$${(component.priceCents / 100).toFixed(2)} on its own`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-end flex-shrink-0">
                  {component.comingSoon ? null : component.format === "both" ? (
                    <>
                      {component.sellOnStripe && (
                        <AddToCartButton
                          productId={component.id}
                          title={component.title}
                          priceCents={component.priceCents}
                          format="physical"
                          variant="physical"
                          label="Buy printed"
                        />
                      )}
                      <AddToCartButton
                        productId={component.id}
                        title={component.title}
                        priceCents={component.digitalPriceCents ?? 0}
                        format="digital"
                        variant="digital"
                        label="Buy digital"
                      />
                    </>
                  ) : (
                    component.sellOnStripe && (
                      <AddToCartButton
                        productId={component.id}
                        title={component.title}
                        priceCents={component.priceCents}
                        format={component.format}
                      />
                    )
                  )}
                  {!component.comingSoon && (
                    <AmazonPurchase sellOnAmazon={component.sellOnAmazon} amazonUrl={component.amazonUrl} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
