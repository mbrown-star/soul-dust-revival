import { db } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  if (!orderId) redirect("/");

  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) redirect("/");

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const productIds = items.map((i) => i.productId);
  const orderedProducts = await db.select().from(products).where(inArray(products.id, productIds));

  const hasDigital = orderedProducts.some((p) => p.format === "digital");
  const hasPhysical = orderedProducts.some((p) => p.format === "physical");

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 space-y-6">
      <h1 className="text-2xl font-semibold">Thank you for your order</h1>
      <p className="text-neutral-600">Order #{order.id.slice(0, 8)}</p>

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
          <p className="text-neutral-600 text-sm">
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
        <p className="text-neutral-600">
          A confirmation with these details has also been sent to your email.
        </p>
      )}

      {/* Digital-only or mixed: prompt to log in and access the web app content. */}
      {hasDigital && (
        <Link
          href="/login?next=/studies"
          className="inline-block bg-neutral-900 text-white rounded-lg px-6 py-3"
        >
          Log in to access your content
        </Link>
      )}
    </div>
  );
}
