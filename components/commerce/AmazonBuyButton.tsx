import { AmazonBuyModal } from "./AmazonBuyModal";

// Plain outbound link — no cart/checkout involvement. The URL is validated
// server-side (lib/validation/schemas.ts productSchema) to be an
// https://amazon.<tld>/... link before it's ever stored, so it's safe to
// render directly here.
export function AmazonBuyButton({ amazonUrl }: { amazonUrl: string }) {
  return (
    <a
      href={amazonUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block font-sans font-semibold bg-ink text-parchment rounded-lg px-6 py-3 hover:bg-dusk focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
    >
      Buy on Amazon
    </a>
  );
}

/**
 * The Amazon route for a printed copy: the buy button once there's a link,
 * or a muted "Coming soon on Amazon" while the admin has chosen Amazon but
 * doesn't have the link yet (products.sellOnAmazon without amazonUrl).
 */
export function AmazonPurchase({
  sellOnAmazon,
  amazonUrl,
  digitalEdition,
  signedInEmail,
}: {
  sellOnAmazon: boolean;
  amazonUrl: string | null;
  /** Set when the printed book comes with a digital edition: the button then explains how to claim it first. */
  digitalEdition?: { productId: string; slug: string; title: string } | null;
  signedInEmail?: string | null;
}) {
  if (amazonUrl && digitalEdition) {
    return (
      <AmazonBuyModal
        amazonUrl={amazonUrl}
        productId={digitalEdition.productId}
        productSlug={digitalEdition.slug}
        productTitle={digitalEdition.title}
        signedInEmail={signedInEmail}
      />
    );
  }
  if (amazonUrl) return <AmazonBuyButton amazonUrl={amazonUrl} />;
  if (!sellOnAmazon) return null;
  return (
    // self-start: the buy button beside it carries a status line below it,
    // which would otherwise stretch this taller than the button.
    <span className="inline-block self-start font-sans font-semibold text-moss border border-moss/30 rounded-lg px-6 py-3">
      Coming soon on Amazon
    </span>
  );
}
