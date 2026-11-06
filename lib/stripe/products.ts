import { stripe } from "./client";
import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

type ProductFormat = "physical" | "digital" | "both";

// A format "both" product has its physical/digital side decided per line
// item (its `variant`), not by the product's own static format -- the
// product itself offers both, but any one purchase of it is only one or
// the other. Every other format decides this from the format alone. Shared
// by app/api/checkout/route.ts and lib/stripe/webhook-handlers.ts, which
// previously each defined their own identical copy of this logic.
export function isDigitalVariant(format: ProductFormat, variant?: "physical" | "digital"): boolean {
  return format === "digital" || (format === "both" && variant === "digital");
}
export function isPhysicalVariant(format: ProductFormat, variant?: "physical" | "digital"): boolean {
  return format === "physical" || (format === "both" && variant === "physical");
}

/**
 * Returns a Stripe Price ID for a given product (or, for a format "both"
 * product, one of its two independent variants), creating the underlying
 * Stripe Product + Price on first use and caching both IDs on the row.
 * This means you manage products only in your own DB — Stripe stays in sync.
 *
 * `variant` selects which of a "both" product's two prices to use —
 * required for "both", ignored otherwise (a plain "physical"/"digital"
 * product only ever has the one price/Stripe-ID pair).
 */
export async function getOrCreateStripePrice(
  productId: string,
  variant?: "physical" | "digital"
): Promise<string> {
  const db = await getDb();
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new Error(`Product ${productId} not found`);

  const useDigital = product.format === "both" && variant === "digital";
  const existingPriceId = useDigital ? product.digitalStripePriceId : product.stripePriceId;
  if (existingPriceId) return existingPriceId;

  const priceCents = useDigital ? product.digitalPriceCents : product.priceCents;
  if (priceCents == null) throw new Error(`Product ${productId} has no ${useDigital ? "digital" : ""} price set`);

  const stripeProduct = await stripe.products.create({
    name: useDigital ? `${product.title} (Digital)` : product.title,
    metadata: { productId: product.id, format: product.format, type: product.type, variant: variant ?? product.format },
  });

  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: priceCents,
    currency: "usd",
  });

  // Same atomic-conditional-update pattern as the Stripe webhook handler's
  // idempotency guard: two concurrent first-time checkouts of this
  // product/variant with no price ID yet could otherwise both create their
  // own Stripe Product + Price. The WHERE here makes only one write win; the
  // losing caller falls back to the ID the winner actually persisted, rather
  // than handing back a Stripe price the DB will never again reference.
  const [updated] = useDigital
    ? await db
        .update(products)
        .set({ digitalStripeProductId: stripeProduct.id, digitalStripePriceId: stripePrice.id })
        .where(and(eq(products.id, product.id), isNull(products.digitalStripePriceId)))
        .returning()
    : await db
        .update(products)
        .set({ stripeProductId: stripeProduct.id, stripePriceId: stripePrice.id })
        .where(and(eq(products.id, product.id), isNull(products.stripePriceId)))
        .returning();

  if (updated) return (useDigital ? updated.digitalStripePriceId : updated.stripePriceId)!;

  const winner = await db.query.products.findFirst({ where: eq(products.id, product.id) });
  return (useDigital ? winner!.digitalStripePriceId : winner!.stripePriceId)!;
}
