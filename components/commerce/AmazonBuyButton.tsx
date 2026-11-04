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
