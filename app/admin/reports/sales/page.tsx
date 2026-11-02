import { db } from "@/lib/db/client";
import { orders, orderItems, products, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic"; // always reflects the latest orders, never a stale build-time snapshot

export default async function SalesReportPage() {
  const paidOrders = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      guestEmail: orders.guestEmail,
      country: orders.country,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      userEmail: users.email,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.status, "paid"))
    .orderBy(desc(orders.createdAt))
    .limit(200);

  // Fetch line items + product titles for these orders, then group in JS —
  // simpler than a nested query per order, and fine at this scale; move to
  // a proper SQL aggregate if order volume grows large.
  const orderIds = new Set(paidOrders.map((o) => o.id));
  const itemsByOrder = new Map<string, { title: string | null; quantity: number }[]>();

  if (orderIds.size > 0) {
    const allItems = await db
      .select({
        orderId: orderItems.orderId,
        quantity: orderItems.quantity,
        title: products.title,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id));

    for (const item of allItems) {
      if (!orderIds.has(item.orderId)) continue;
      const list = itemsByOrder.get(item.orderId) ?? [];
      list.push({ title: item.title, quantity: item.quantity });
      itemsByOrder.set(item.orderId, list);
    }
  }

  const totalRevenueCents = paidOrders.reduce((sum, o) => sum + o.totalCents, 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reports" className="text-sm text-neutral-400">
          ← Reports
        </Link>
        <h1 className="text-xl font-semibold">Sales</h1>
      </div>

      <div className="flex gap-8">
        <div>
          <p className="text-2xl font-semibold">${(totalRevenueCents / 100).toFixed(2)}</p>
          <p className="text-sm text-neutral-500">Total revenue (last 200 orders)</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{paidOrders.length}</p>
          <p className="text-sm text-neutral-500">Orders</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b text-neutral-500">
              <th scope="col" className="py-2 pr-4 font-medium">Date</th>
              <th scope="col" className="py-2 pr-4 font-medium">Buyer</th>
              <th scope="col" className="py-2 pr-4 font-medium">Country</th>
              <th scope="col" className="py-2 pr-4 font-medium">Items</th>
              <th scope="col" className="py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {paidOrders.map((order) => (
              <tr key={order.id} className="border-b border-neutral-100">
                <td className="py-3 pr-4 text-neutral-500">
                  {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}
                </td>
                <td className="py-3 pr-4">{order.userEmail ?? order.guestEmail ?? "—"}</td>
                <td className="py-3 pr-4">{order.country}</td>
                <td className="py-3 pr-4">
                  {(itemsByOrder.get(order.id) ?? [])
                    .map((i) => `${i.title ?? "Unknown product"} ×${i.quantity}`)
                    .join(", ")}
                </td>
                <td className="py-3">${(order.totalCents / 100).toFixed(2)}</td>
              </tr>
            ))}
            {paidOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-400">
                  No paid orders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
