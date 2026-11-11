import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users, orders, orderItems, products, responses, loginEvents, entitlements, journeyEnrollments, journeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Returns everything this app has stored about the requesting user, as a
 * single downloadable JSON file — the self-service fulfillment of a GDPR
 * Art. 15 / CCPA access request. Deliberately scoped to only the calling
 * user's own data (via session.userId), never anyone else's — this is a
 * self-service endpoint, not an admin tool.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();

  const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });

  const myOrders = await db.select().from(orders).where(eq(orders.userId, session.userId));
  const orderIds = myOrders.map((o) => o.id);

  const myOrderItems =
    orderIds.length > 0
      ? (
          await db
            .select({ orderId: orderItems.orderId, quantity: orderItems.quantity, productTitle: products.title })
            .from(orderItems)
            .leftJoin(products, eq(orderItems.productId, products.id))
        ).filter((i) => orderIds.includes(i.orderId))
      : [];

  const myResponses = await db.select().from(responses).where(eq(responses.userId, session.userId));
  const myLogins = await db.select().from(loginEvents).where(eq(loginEvents.userId, session.userId));
  const myEntitlements = await db.select().from(entitlements).where(eq(entitlements.userId, session.userId));
  const myJourneys = await db
    .select({ journey: journeys.title, enrollment: journeyEnrollments })
    .from(journeyEnrollments)
    .innerJoin(journeys, eq(journeys.id, journeyEnrollments.journeyId))
    .where(eq(journeyEnrollments.userId, session.userId));

  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: user
      ? { email: user.email, fullName: user.fullName, country: user.country, role: user.role, createdAt: user.createdAt }
      : null,
    orders: myOrders.map((o) => ({
      id: o.id,
      totalCents: o.totalCents,
      status: o.status,
      country: o.country,
      createdAt: o.createdAt,
      items: myOrderItems.filter((i) => i.orderId === o.id).map((i) => ({ product: i.productTitle, quantity: i.quantity })),
    })),
    studyResponses: myResponses.map((r) => ({ answerText: r.answerText, createdAt: r.createdAt, updatedAt: r.updatedAt })),
    loginHistory: myLogins.map((l) => ({ loginAt: l.loginAt, lastActiveAt: l.lastActiveAt })),
    entitlements: myEntitlements.map((e) => ({ grantedAt: e.grantedAt, source: e.source })),
    journeys: myJourneys.map(({ journey, enrollment }) => ({
      journey,
      journeyWeekday: enrollment.weekday,
      timeZone: enrollment.timeZone,
      begunAt: enrollment.createdAt,
    })),
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="my-data-export.json"`,
    },
  });
}
