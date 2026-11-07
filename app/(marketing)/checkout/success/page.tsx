import { getDb } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { ClearCartOnMount } from "@/components/commerce/ClearCartOnMount";
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
  const orderedProducts = await db.select().from(products).where(inArray(products.id, productIds));

  const hasDigital = orderedProducts.some((p) => p.format === "digital");
  const hasPhysical = orderedProducts.some((p) => p.format === "physical");

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 space-y-6">
      <ClearCartOnMount />
      <h1 className="font-display font-bold text-2xl text-ink">Thank you for your order</h1>
      <p className="text-moss">Order #{order.id.slice(0, 8)}</p>

      <div className="space-y-2 border-t border-b py-4">
        {orderedProducts.map((p) => (
          <div key={p.id} className="flex justify-between">
            <span>{p.title}</span>
            <span>${(p.priceCents / 100).toFixed(2)}</span>
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

      {/* Physical-only: order info was emailed, nothing further needed here. */}
      {!hasDigital && hasPhysical && (
        <p className="text-moss">
          A confirmation with these details has also been sent to your email.
        </p>
      )}

      {/* Digital-only or mixed: prompt to log in and access the web app content. */}
      {hasDigital && (
        <Link
          href="/login?next=/library"
          className="inline-block bg-ink text-white rounded-lg px-6 py-3"
        >
          Log in to access your content
        </Link>
      )}
    </div>
  );
}
