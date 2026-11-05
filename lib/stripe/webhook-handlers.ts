import { getDb } from "@/lib/db/client";
import { orders, orderItems, entitlements, products } from "@/lib/db/schema";
import { eq, inArray, and, ne } from "drizzle-orm";
import type Stripe from "stripe";
import { sendOrderConfirmationEmail } from "@/lib/email/send";

/**
 * Called from the /api/webhooks/stripe route on checkout.session.completed.
 * - Marks the order paid
 * - Records shipping details if collected
 * - Grants entitlements only for digital/webapp products (not physical books)
 * - Sends a confirmation email appropriate to the order composition
 */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session, appUrl: string) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const shipping = session.shipping_details;
  const db = await getDb();

  // Idempotency guard, done as a single atomic conditional update rather
  // than a separate read-then-write: Stripe can redeliver the same event,
  // including near-simultaneously under retry/duplicate-delivery scenarios.
  // A read-then-write check has a race window where two concurrent
  // deliveries could both pass a "status !== paid" check before either has
  // written — the WHERE clause here makes the transition itself the check,
  // so at most one concurrent call can ever win it.
  const [order] = await db
    .update(orders)
    .set({
      status: "paid",
      totalCents: session.amount_total ?? undefined, // reflects any promo code discount applied at Stripe
      shippingName: shipping?.name ?? null,
      shippingLine1: shipping?.address?.line1 ?? null,
      shippingLine2: shipping?.address?.line2 ?? null,
      shippingCity: shipping?.address?.city ?? null,
      shippingState: shipping?.address?.state ?? null,
      shippingPostalCode: shipping?.address?.postal_code ?? null,
      shippingCountry: shipping?.address?.country ?? null,
    })
    .where(and(eq(orders.id, orderId), ne(orders.status, "paid")))
    .returning();

  // No row came back means either the order doesn't exist, or (far more
  // likely) another delivery of this same event already claimed it — either
  // way, there's nothing left for this call to do.
  if (!order) return;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const productIds = items.map((i) => i.productId);
  const orderedProducts = await db.select().from(products).where(inArray(products.id, productIds));

  const digitalProducts = orderedProducts.filter((p) => p.format === "digital");
  const hasPhysical = orderedProducts.some((p) => p.format === "physical");

  // Only digital/webapp content grants an entitlement — physical books just ship.
  if (order.userId) {
    for (const product of digitalProducts) {
      await db.insert(entitlements).values({
        userId: order.userId,
        productId: product.id,
        source: "purchase",
        expiresAt: null,
      });
    }
  }

  const composition: "physical_only" | "digital_only" | "mixed" =
    hasPhysical && digitalProducts.length > 0
      ? "mixed"
      : hasPhysical
      ? "physical_only"
      : "digital_only";

  const recipientEmail = order.guestEmail ?? session.customer_details?.email ?? "";

  await sendOrderConfirmationEmail({
    to: recipientEmail,
    orderId: order.id,
    composition,
    hasWebAppAccess: digitalProducts.length > 0,
    totalCents: session.amount_total ?? order.totalCents,
    items: orderedProducts.map((p) => ({ title: p.title, priceCents: p.priceCents })),
    appUrl,
  });
}
