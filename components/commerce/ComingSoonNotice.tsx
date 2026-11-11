// Shown in place of a product's price and buy buttons while it's marked
// "Coming soon" (products.comingSoon): announced, not for sale yet.
export function ComingSoonNotice() {
  return (
    <div className="border border-moss/20 rounded-lg p-4">
      <p className="font-sans text-xl font-semibold text-ink">Coming soon</p>
      <p className="font-sans text-sm text-moss mt-1">This title isn&apos;t available to buy yet. Check back soon.</p>
    </div>
  );
}
