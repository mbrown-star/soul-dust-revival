import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type Db } from "@/lib/db/client";
import { entitlements, orders, orderItems, products, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

// sendOrderConfirmationEmail calls the real Resend API -- mocked so these
// tests never send a real email (or need a real RESEND_API_KEY).
vi.mock("@/lib/email/send", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

const { handleCheckoutCompleted } = await import("./webhook-handlers");
const { sendOrderConfirmationEmail } = await import("@/lib/email/send");

function fakeCheckoutSession(orderId: string, overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    metadata: { orderId },
    amount_total: 2900,
    shipping_details: null,
    customer_details: { email: "buyer@example.com" },
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

describe("handleCheckoutCompleted", () => {
  let userId: string;
  let digitalProductId: string;
  let physicalProductId: string;
  let orderId: string;
  let db: Db;

  beforeEach(async () => {
    db = await getDb();
    vi.clearAllMocks();

    const [user] = await db
      .insert(users)
      .values({ email: `test-${randomUUID()}@example.com`, role: "user" })
      .returning();
    userId = user!.id;

    const [digitalProduct] = await db
      .insert(products)
      .values({
        type: "study_access",
        format: "digital",
        title: "Digital Study",
        slug: `digital-study-${randomUUID()}`,
        priceCents: 2900,
      })
      .returning();
    digitalProductId = digitalProduct!.id;

    const [physicalProduct] = await db
      .insert(products)
      .values({
        type: "book",
        format: "physical",
        title: "Companion Book",
        slug: `companion-book-${randomUUID()}`,
        priceCents: 1899,
      })
      .returning();
    physicalProductId = physicalProduct!.id;

    const [order] = await db
      .insert(orders)
      .values({ userId, country: "US", status: "pending", totalCents: 2900 })
      .returning();
    orderId = order!.id;

    await db.insert(orderItems).values({ orderId, productId: digitalProductId, quantity: 1 });
  });

  afterEach(async () => {
    await db.delete(entitlements).where(eq(entitlements.userId, userId));
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(products).where(eq(products.id, digitalProductId));
    await db.delete(products).where(eq(products.id, physicalProductId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("marks the order paid and grants an entitlement for a digital product", async () => {
    await handleCheckoutCompleted(fakeCheckoutSession(orderId), "https://example.com");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid");

    const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.productId).toBe(digitalProductId);
    expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
  });

  it("is idempotent under Stripe webhook redelivery: a second call is a no-op", async () => {
    await handleCheckoutCompleted(fakeCheckoutSession(orderId), "https://example.com");
    await handleCheckoutCompleted(fakeCheckoutSession(orderId), "https://example.com");

    const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
    expect(grants).toHaveLength(1); // not 2 -- the bug class this guard exists to prevent

    expect(sendOrderConfirmationEmail).toHaveBeenCalledTimes(1); // not double-sent either
  });

  it("does not grant an entitlement for a physical-only order", async () => {
    // Swap the order to a physical-only cart for this case.
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    await db.insert(orderItems).values({ orderId, productId: physicalProductId, quantity: 1 });

    await handleCheckoutCompleted(fakeCheckoutSession(orderId), "https://example.com");

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid");

    const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
    expect(grants).toHaveLength(0);
  });

  it("does nothing for an unknown orderId (no matching metadata)", async () => {
    await handleCheckoutCompleted(fakeCheckoutSession(randomUUID()), "https://example.com");
    expect(sendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  describe("format: \"both\" products", () => {
    it("grants an entitlement for the digital variant of a \"both\" order item, but not the physical one", async () => {
      const [bothProduct] = await db
        .insert(products)
        .values({
          type: "book",
          format: "both",
          title: "Both Format Book",
          slug: `both-format-${randomUUID()}`,
          priceCents: 1999,
          digitalPriceCents: 999,
        })
        .returning();

      // Replace the default digital-only order item with the "both"
      // product's two variants, same order.
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.insert(orderItems).values([
        { orderId, productId: bothProduct!.id, quantity: 1, variant: "physical" },
        { orderId, productId: bothProduct!.id, quantity: 1, variant: "digital" },
      ]);

      try {
        await handleCheckoutCompleted(
          fakeCheckoutSession(orderId, { amount_total: 2998 }),
          "https://example.com"
        );

        const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
        expect(order!.status).toBe("paid");

        // One entitlement for the product, even though it has two order
        // items -- the digital one grants it, the physical one doesn't, and
        // they're never double-counted into two entitlement rows.
        const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
        expect(grants).toHaveLength(1);
        expect(grants[0]!.productId).toBe(bothProduct!.id);
      } finally {
        // Delete this product's own entitlement and order-item rows first --
        // the outer afterEach's cleanup for both (scoped by userId/orderId)
        // hasn't run yet at this point, and the FKs from those tables to
        // products would otherwise reject deleting the product while it's
        // still referenced.
        await db.delete(entitlements).where(eq(entitlements.productId, bothProduct!.id));
        await db.delete(orderItems).where(eq(orderItems.productId, bothProduct!.id));
        await db.delete(products).where(eq(products.id, bothProduct!.id));
      }
    });
  });
});
