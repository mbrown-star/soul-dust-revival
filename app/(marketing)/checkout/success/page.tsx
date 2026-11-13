import { getDb } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ClearCartOnMount } from "@/components/commerce/ClearCartOnMount";
import { isDigitalVariant, isPhysicalVariant } from "@/lib/stripe/products";
import { appUrl } from "@/lib/domains";
import { includesDigitalEdition } from "@/lib/commerce/digitalEdition";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order confirmed",
};

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId) redirect("/");
  const db = await getDb();

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) redirect("/");

  // Orders placed while logged in belong to that account — without this
  // check, anyone who obtains any order's UUID (a forwarded link, browser
  // history, a referrer leak) could view another customer's full order,
  // including their shipping name and address. Guest orders (no userId)
  // have no account to check against, so — same as most storefolks'
  // guest-order confirmation pages — the link itself is the credential.
  if (order.userId) {
    const session = await getSession();
    if (!session || session.userId !== order.userId) redirect("/");
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const productIds = items.map((i) => i.productId);
  const productsById = new Map(
    (await db.select().from(products).where(inArray(products.id, productIds))).map((p) => [p.id, p])
  );

  // REAL FIX (qa/findings/FINDINGS_2026-11-07.md #4): previously deduped by
  // productId before rendering, so a "both"-format order (two order_items
  // sharing one productId -- one variant: "physical", one "digital")
  // rendered as a single line, always priced at the product's physical
  // priceCents even when the digital line was what was actually charged.
  // The bottom Total was always correct (order.totalCents), so the visible
  // bug was a line-item breakdown that silently didn't add up to it.
  // Iterating orderItems directly, one line per real purchase, fixes both:
  // the missing second line and the wrong price. Also multiplies by
  // quantity, which this page never did even though checkout itself always
  // has (app/api/checkout/route.ts).
  const lineItems = items
    .map((item) => {
      const product = productsById.get(item.productId);
      if (!product) return null;
      const unitPriceCents =
        product.format === "both" && item.variant === "digital"
          ? (product.digitalPriceCents ?? product.priceCents)
          : product.priceCents;
      // Checkout always sets `variant` for a "both"-format order_item, so a
      // null one here shouldn't happen -- but the schema itself allows it,
      // and isDigitalVariant/isPhysicalVariant both return false for
      // format:"both" with no variant (found in review), which would show
      // this page's visitor NEITHER the shipping-confirmation copy nor the
      // "sign in to access your content" link, no guidance at all. Treating
      // an ambiguous "both" item as counting toward both is the safer
      // failure mode -- worst case is one extra, harmless line of copy.
      const variantKnown = product.format !== "both" || item.variant !== null;
      return {
        id: item.id,
        title: product.title,
        variant: item.variant,
        totalCents: unitPriceCents * item.quantity,
        isDigital: variantKnown ? isDigitalVariant(product.format, item.variant ?? undefined) : true,
        isPhysical: variantKnown ? isPhysicalVariant(product.format, item.variant ?? undefined) : true,
      };
    })
    .filter((li): li is NonNullable<typeof li> => li !== null);

  const hasPhysical = lineItems.some((li) => li.isPhysical);
  // Something in the order is readable in the app. An account order only:
  // that's who the webhook granted access to (older guest orders got none).
  const hasAppContent = !!order.userId && (await includesDigitalEdition(db, productIds));

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 space-y-6">
      <ClearCartOnMount />
      <h1 className="font-display font-bold text-2xl text-ink">Thank you for your order</h1>
      <p className="text-moss">Order #{order.id.slice(0, 8)}</p>

      <div className="space-y-2 border-t border-b py-4">
        {lineItems.map((li) => (
          <div key={li.id} className="flex justify-between">
            <span>
              {li.title}
              {li.variant && <span className="text-moss text-sm"> ({li.variant})</span>}
            </span>
            <span>${(li.totalCents / 100).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold pt-2">
          <span>Total</span>
          <span>${(order.totalCents / 100).toFixed(2)}</span>
        </div>
      </div>

      {order.requiresShipping && (
        <div>
          <h2 className="font-medium mb-1">Shipping to</h2>
          <p className="text-moss text-sm">
            {order.shippingName}
            <br />
            {order.shippingLine1}
            {order.shippingLine2 && <>, {order.shippingLine2}</>}
            <br />
            {order.shippingCity}, {order.shippingState} {order.shippingPostalCode}
            <br />
            {order.shippingCountry}
          </p>
        </div>
      )}

      <p className="text-moss">A confirmation with these details has also been sent to your email.</p>

      {/* A printed book comes with its digital edition, granted to this
          account by the webhook along with anything bought digital. */}
      {hasPhysical && hasAppContent && (
        <p className="text-ink">Your book also comes with its digital edition, ready in the Soul Dust Revival app.</p>
      )}

      {hasAppContent && (
        <Link
          href={appUrl("/library")}
          className="inline-block bg-ink text-white rounded-lg px-6 py-3"
        >
          Open My Library
        </Link>
      )}
    </div>
  );
}
