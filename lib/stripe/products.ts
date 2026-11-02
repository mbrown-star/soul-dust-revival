import { stripe } from "./client";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Returns a Stripe Price ID for a given product, creating the underlying
 * Stripe Product + Price on first use and caching both IDs on the row.
 * This means you manage products only in your own DB — Stripe stays in sync.
 */
export async function getOrCreateStripePrice(productId: string): Promise<string> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new Error(`Product ${productId} not found`);

  if (product.stripePriceId) return product.stripePriceId;

  const stripeProduct = await stripe.products.create({
    name: product.title,
    metadata: { productId: product.id, format: product.format, type: product.type },
  });

  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    unit_amount: product.priceCents,
    currency: "usd",
  });

  // Same atomic-conditional-update pattern as the Stripe webhook handler's
  // idempotency guard: two concurrent first-time checkouts of a product with
  // no stripePriceId yet could otherwise both create their own Stripe
  // Product + Price. The WHERE here makes only one write win; the losing
  // caller falls back to the ID the winner actually persisted, rather than
  // handing back a Stripe price the DB will never again reference.
  const [updated] = await db
    .update(products)
    .set({ stripeProductId: stripeProduct.id, stripePriceId: stripePrice.id })
    .where(and(eq(products.id, product.id), isNull(products.stripePriceId)))
    .returning();

  if (updated) return updated.stripePriceId!;

  const winner = await db.query.products.findFirst({ where: eq(products.id, product.id) });
  return winner!.stripePriceId!;
}
