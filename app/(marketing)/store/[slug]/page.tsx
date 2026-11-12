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
import { includesDigitalEdition, productIdsWithDigitalEdition } from "@/lib/commerce/digitalEdition";
import { getSession } from "@/lib/auth/session";
import { PrintedPurchaseNote } from "@/components/commerce/PrintedPurchaseNote";
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

  // A printed copy comes with its digital edition when there's a study to
  // read (for a bundle, any component's). Said beside the printed buy options.
  const includesDigital = await includesDigitalEdition(db, [product.id]);
  // Buy on Amazon explains the digital edition (and offers to email the claim
  // link) for a printed book that has one; a signed-in reader's email is filled in.
  const withDigital = await productIdsWithDigitalEdition(db, [product.id, ...components.map((c) => c.id)]);
  const session = await getSession();
  const digitalEditionOf = (p: { id: string; slug: string; title: string }) =>
    withDigital.has(p.id) ? { productId: p.id, slug: p.slug, title: p.title } : null;
  const onAmazon = product.sellOnAmazon || !!product.amazonUrl;
  const printedNote = (
    <PrintedPurchaseNote
      slug={product.slug}
      isBundle={product.type === "bundle"}
      includesDigital={includesDigital}
      sellsOnStripe={product.sellOnStripe}
      onAmazon={onAmazon}
      amazonLinkLive={!!product.amazonUrl}
    />
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 items-start">
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
          <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-6">
            {product.title}
          </h1>
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
                <div className="flex flex-wrap items-start gap-3">
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
                  <AmazonPurchase
                    sellOnAmazon={product.sellOnAmazon}
                    amazonUrl={product.amazonUrl}
                    digitalEdition={digitalEditionOf(product)}
                    signedInEmail={session?.email}
                  />
                </div>
                {printedNote}
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
                  {includesDigital
                    ? "The digital edition on its own, without the printed copy. "
                    : ""}
                  Digital access requires an account — you&apos;ll be prompted to sign up during checkout.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="font-sans text-2xl font-semibold text-ink mb-6">
                ${(product.priceCents / 100).toFixed(2)}
              </p>

              <div className="flex flex-wrap items-start gap-3">
                {product.sellOnStripe && (
                  <AddToCartButton
                    productId={product.id}
                    title={product.title}
                    priceCents={product.priceCents}
                    format={product.format}
                  />
                )}
                <AmazonPurchase
                    sellOnAmazon={product.sellOnAmazon}
                    amazonUrl={product.amazonUrl}
                    digitalEdition={digitalEditionOf(product)}
                    signedInEmail={session?.email}
                  />
              </div>

              {product.format === "digital" ? (
                <p className="font-sans text-sm text-moss mt-6">
                  {product.type === "bundle"
                    ? "One purchase, everything below included."
                    : "Digital studies require an account — you'll be prompted to sign up during checkout."}
                </p>
              ) : (
                <>
                  {product.type === "bundle" && (
                    <p className="font-sans text-sm text-moss mt-6">One purchase, everything below included.</p>
                  )}
                  {printedNote}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* The full description reads as one column under the cover and buy
          options (explicit request, 2026-11-11), rather than squeezed into
          the narrow column beside the cover. pre-line keeps any paragraph
          breaks the admin typed. */}
      {product.description && (
        <section className="mt-12 sm:mt-16" aria-labelledby="product-description-heading">
          <h2 id="product-description-heading" className="font-display font-bold text-2xl text-ink mb-4">
            About this {product.type === "bundle" ? "bundle" : product.kind}
          </h2>
          <p className="font-serif text-ink/80 leading-relaxed whitespace-pre-line">{product.description}</p>
        </section>
      )}

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
                <div className="flex flex-wrap items-start gap-2 justify-end flex-shrink-0">
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
                    <AmazonPurchase
                      sellOnAmazon={component.sellOnAmazon}
                      amazonUrl={component.amazonUrl}
                      digitalEdition={digitalEditionOf(component)}
                      signedInEmail={session?.email}
                    />
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
