import Link from "next/link";

/**
 * The line under a printed copy's buy buttons on a product page. A printed
 * copy includes its digital edition (explicit decision, 2026-11-11) when a
 * study is linked to it; this says how each route delivers that:
 * - our own checkout: ships from us, the digital edition is in the account
 *   they sign in with at checkout;
 * - Amazon: ships from Amazon, and the digital edition is claimed on /claim
 *   with the Amazon order number.
 */
export function PrintedPurchaseNote({
  slug,
  isBundle,
  includesDigital,
  sellsOnStripe,
  onAmazon,
  amazonLinkLive,
}: {
  slug: string;
  isBundle: boolean;
  includesDigital: boolean;
  sellsOnStripe: boolean;
  /** Amazon is a route for it, live or "coming soon". */
  onAmazon: boolean;
  /** The Amazon link exists, so there's something to claim already. */
  amazonLinkLive: boolean;
}) {
  const thing = isBundle ? "bundle" : "printed book";
  return (
    <div className="font-sans text-sm text-moss mt-3 space-y-2">
      {sellsOnStripe && (
        <p>
          {includesDigital
            ? `Ships within a few business days, and includes the digital edition in the Soul Dust Revival app${
                isBundle ? " for each title" : ""
              }. You'll sign in at checkout so it's waiting in your library.`
            : "Ships within a few business days. You'll sign in at checkout."}
        </p>
      )}
      {onAmazon &&
        (includesDigital ? (
          <div className="border border-moss/20 rounded-lg p-4 bg-white text-ink">
            <p className="font-semibold">Buying on Amazon? You get both:</p>
            <ul className="mt-2 space-y-1 list-disc pl-5">
              <li>The {thing}, shipped to you by Amazon</li>
              <li>
                Its digital edition in the Soul Dust Revival app{isBundle ? ", for each title" : ""}, unlocked with
                your Amazon order number
              </li>
            </ul>
            {amazonLinkLive && (
              <p className="mt-3">
                <Link
                  href={`/claim?product=${encodeURIComponent(slug)}`}
                  className="underline font-semibold hover:text-moss focus:outline-none focus:ring-2 focus:ring-ink rounded"
                >
                  Already ordered? Claim your digital edition
                </Link>
              </p>
            )}
          </div>
        ) : (
          <p>Sold and shipped by Amazon.</p>
        ))}
    </div>
  );
}
