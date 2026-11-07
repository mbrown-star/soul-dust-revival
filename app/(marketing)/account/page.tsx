import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { orders, orderItems, products } from "@/lib/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import AccountPageClient, { type OrderSummary } from "./AccountPageClient";
import type { Metadata } from "next";

// Needed for the nonce-based CSP in proxy.ts: nonces require a fresh
// per-request render, which only happens for dynamically-rendered pages.
// Without this, this page would otherwise be statically prerendered at
// build time with no nonce, and its hydration scripts would be blocked by
// the CSP in production. This must live in a Server Component -- route
// segment config exports are silently ignored in a "use client" file,
// which is why the actual page content lives in AccountPageClient instead.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your account",
};

export default async function AccountPage() {
  // REAL FIX (qa/findings/FINDINGS_2026-11-07.md #5): this page previously
  // had no server-side session check at all -- a guest hitting /account
  // directly got a 200 and was stuck on AccountPageClient's "Loading..."
  // state forever, since nothing there ever redirected them anywhere. Every
  // other gated page in this app (/library, /admin/*, /leader) already
  // guards itself this same way.
  const session = await getSession();
  if (!session) redirect("/login?next=/account");

  // REAL FIX (#6): qa-user's real paid/pending orders had nowhere to be
  // seen in the account UI at all. A fixed few rows per customer, not a
  // paginated-scale query -- ordered newest first like the admin sales
  // report already does.
  const myOrders = await getOrdersForAccount(session.userId);

  return <AccountPageClient email={session.email} orders={myOrders} />;
}

async function getOrdersForAccount(userId: string): Promise<OrderSummary[]> {
  const db = await getDb();
  const myOrders = await db
    .select({
      id: orders.id,
      status: orders.status,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  const orderIds = myOrders.map((o) => o.id);
  const items =
    orderIds.length === 0
      ? []
      : await db
          .select({ orderId: orderItems.orderId, productId: orderItems.productId, quantity: orderItems.quantity })
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds));

  const productIds = [...new Set(items.map((i) => i.productId))];
  const productTitlesById =
    productIds.length === 0
      ? new Map<string, string>()
      : new Map(
          (await db.select({ id: products.id, title: products.title }).from(products).where(inArray(products.id, productIds))).map(
            (p) => [p.id, p.title]
          )
        );

  const itemsByOrderId = new Map<string, string[]>();
  for (const item of items) {
    const title = productTitlesById.get(item.productId) ?? "Unknown item";
    const label = item.quantity > 1 ? `${title} ×${item.quantity}` : title;
    const existing = itemsByOrderId.get(item.orderId) ?? [];
    existing.push(label);
    itemsByOrderId.set(item.orderId, existing);
  }

  return myOrders.map((o) => ({
    id: o.id,
    status: o.status,
    totalCents: o.totalCents,
    createdAt: o.createdAt?.toISOString() ?? null,
    itemLabels: itemsByOrderId.get(o.id) ?? [],
  }));
}
