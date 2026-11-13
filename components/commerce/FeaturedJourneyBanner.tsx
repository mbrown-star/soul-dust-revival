import Image from "next/image";
import Link from "next/link";
import { coverAspectRatio } from "@/lib/images/coverAspectRatio";
import type { FeaturedJourney } from "@/lib/journey/featured";
import { storePriceLine } from "@/lib/commerce/priceSummary";

function price(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** A sentence-opening count: "Four", or "12" past ten. */
function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** "Digital $75.00 · Printed $90.00", by the bundle's format. */
function priceLine(product: FeaturedJourney["product"]): string {
  if (product.comingSoon) return "Coming soon";
  if (product.format === "both" && product.digitalPriceCents != null) return storePriceLine(product);
  return `${product.format === "physical" ? "Printed" : "Digital"} ${price(product.priceCents)}`;
}

/**
 * A full-width band at the top of the Store featuring the Journey bundle:
 * its cover, its Parts in order with their week ranges, its prices and a
 * link to the bundle's own page (where it's bought).
 */
export function FeaturedJourneyBanner({ featured }: { featured: FeaturedJourney }) {
  const { product, parts, stopCount } = featured;
  const href = `/store/${product.slug}`;

  return (
    <section aria-labelledby="featured-journey-heading" className="bg-ink text-parchment mottle">
      <div className="max-w-5xl mx-auto px-4 py-10 sm:py-14 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-8 sm:gap-12 items-center">
        <div
          className="relative w-full max-w-[15rem] sm:max-w-none mx-auto rounded-xl overflow-hidden shadow-2xl ring-1 ring-gold/30 bg-dusk"
          style={{ aspectRatio: coverAspectRatio(product.imageWidth, product.imageHeight) }}
        >
          {product.imageUrl && (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt ?? ""}
              fill
              priority
              sizes="(min-width: 1024px) 380px, (min-width: 640px) 38vw, 15rem"
              className="object-cover"
            />
          )}
        </div>

        <div>
          <p className="font-sans text-xs uppercase tracking-[0.2em] text-gold mb-3">Featured bundle</p>
          <h2 id="featured-journey-heading" className="font-display font-bold text-4xl sm:text-5xl leading-none mb-4">
            {featured.title}
          </h2>
          <p className="font-serif text-parchment/85 text-lg mb-6 max-w-prose">
            {parts.length > 1 ? `${countWord(parts.length)} studies, read as one road. ` : ""}
            {stopCount > 0 ? `One stop opens each week, ${stopCount} in all.` : ""}
          </p>

          {parts.length > 0 && (
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-8">
              {parts.map((part) => {
                const [head, name] = part.label.split(" — ");
                return (
                  <li key={part.label} className="border-l-2 border-gold/60 pl-3">
                    <p className="font-sans text-xs uppercase tracking-wide text-gold">
                      {name ? head : null}
                      {name && part.firstWeek != null ? " · " : null}
                      {part.firstWeek != null ? `Weeks ${part.firstWeek}–${part.lastWeek}` : null}
                    </p>
                    <p className="font-serif text-parchment">{name ?? part.label}</p>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={href}
              className="inline-flex items-center min-h-11 rounded-lg bg-gold text-ink px-5 py-2.5 font-sans font-semibold hover:bg-parchment transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-parchment focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Explore {featured.title}
              <span aria-hidden="true" className="ml-2">→</span>
            </Link>
            <p className="font-sans text-sm text-parchment/80">{priceLine(product)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
