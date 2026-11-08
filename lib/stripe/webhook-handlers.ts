import { getDb } from "@/lib/db/client";
import { orders, orderItems, entitlements, products, bundleItems } from "@/lib/db/schema";
import { eq, inArray, and, ne } from "drizzle-orm";
import type Stripe from "stripe";
import { sendOrderConfirmationEmail, sendBundleShipmentNotificationEmail } from "@/lib/email/send";
import { isDigitalVariant, isPhysicalVariant } from "./products";

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
  const productById = new Map(orderedProducts.map((p) => [p.id, p]));

  // A format "both" product has its physical/digital sides decided per
  // order item (its `variant`), not by the product's own static format —
  // the product itself offers both, but any one purchase of it is only one
  // or the other. Every other format still decides this from the product
  // alone, same as before.
  const isDigitalItem = (item: (typeof items)[number]) => {
    const product = productById.get(item.productId)!;
    return isDigitalVariant(product.format, item.variant ?? undefined);
  };
  const isPhysicalItem = (item: (typeof items)[number]) => {
    const product = productById.get(item.productId)!;
    return isPhysicalVariant(product.format, item.variant ?? undefined);
  };

  const digitalItems = items.filter(isDigitalItem);
  const hasPhysical = items.some(isPhysicalItem);
  const recipientEmail = order.guestEmail ?? session.customer_details?.email ?? "";

  // Only digital/webapp content grants an entitlement — physical books just
  // ship. One entitlement per distinct product, even if it somehow appears
  // in more than one digital line item (quantity already covers "more than
  // one copy" without needing more than one entitlement row). A digital
  // bundle is excluded from this ordinary per-item loop -- nothing gates
  // content behind the bundle's own product id, only behind each
  // component's -- and instead cascades below.
  if (order.userId) {
    const grantedProductIds = new Set<string>();
    const digitalBundleIds: string[] = [];
    for (const item of digitalItems) {
      const product = productById.get(item.productId)!;
      if (product.type === "bundle") {
        digitalBundleIds.push(product.id);
        continue;
      }
      if (grantedProductIds.has(item.productId)) continue;
      grantedProductIds.add(item.productId);
      await db.insert(entitlements).values({
        userId: order.userId,
        productId: item.productId,
        source: "purchase",
        expiresAt: null,
      });
    }

    // Buying a digital bundle cascades an entitlement to every one of its
    // components, exactly as if each had been bought individually. Added to
    // the same `grantedProductIds` set so a component that's *also*
    // independently in the cart (bought both inside the bundle and on its
    // own) still only gets one entitlement row.
    if (digitalBundleIds.length > 0) {
      const components = await db
        .select({ bundleProductId: bundleItems.bundleProductId, componentProductId: bundleItems.componentProductId })
        .from(bundleItems)
        .where(inArray(bundleItems.bundleProductId, digitalBundleIds));
      for (const { componentProductId } of components) {
        if (grantedProductIds.has(componentProductId)) continue;
        grantedProductIds.add(componentProductId);
        await db.insert(entitlements).values({
          userId: order.userId,
          productId: componentProductId,
          source: "purchase",
          expiresAt: null,
        });
      }
    }
  }

  // A physical bundle ships like any other physical product, but there's no
  // Amazon fulfillment behind it (bundles are always Stripe-only -- see
  // app/api/admin/bundles/route.ts) and no other automated fulfillment
  // pipeline either, so the one person who actually packs and ships it needs
  // a direct heads-up rather than relying on the admin "Reports" area.
  const physicalBundleItems = items.filter((item) => {
    const product = productById.get(item.productId)!;
    return product.type === "bundle" && isPhysicalItem(item);
  });
  if (physicalBundleItems.length > 0) {
    await sendBundleShipmentNotificationEmail({
      orderId: order.id,
      customerEmail: recipientEmail,
      shippingName: order.shippingName,
      shippingLine1: order.shippingLine1,
      shippingLine2: order.shippingLine2,
      shippingCity: order.shippingCity,
      shippingState: order.shippingState,
      shippingPostalCode: order.shippingPostalCode,
      shippingCountry: order.shippingCountry,
      bundles: physicalBundleItems.map((item) => ({
        title: productById.get(item.productId)!.title,
        quantity: item.quantity,
      })),
    });
  }

  const composition: "physical_only" | "digital_only" | "mixed" =
    hasPhysical && digitalItems.length > 0
      ? "mixed"
      : hasPhysical
      ? "physical_only"
      : "digital_only";

  await sendOrderConfirmationEmail({
    to: recipientEmail,
    orderId: order.id,
    composition,
    hasWebAppAccess: digitalItems.length > 0,
    totalCents: session.amount_total ?? order.totalCents,
    items: items.map((item) => {
      const product = productById.get(item.productId)!;
      const digital = isDigitalItem(item);
      // Falls back to the physical price rather than asserting non-null --
      // productSchema requires digitalPriceCents whenever format is "both",
      // but that's enforced at the admin-write boundary, not the (nullable)
      // database column, and this runs after the order is already paid, so
      // it must never throw here.
      const priceCents = digital && product.format === "both" ? product.digitalPriceCents ?? product.priceCents : product.priceCents;
      const title = product.format === "both" ? `${product.title} (${digital ? "Digital" : "Physical"})` : product.title;
      return { title, priceCents };
    }),
    appUrl,
  });
}
