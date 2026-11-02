import { stripe } from "./client";
import { db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

  await db
    .update(products)
    .set({ stripeProductId: stripeProduct.id, stripePriceId: stripePrice.id })
    .where(eq(products.id, product.id));

  return stripePrice.id;
}
