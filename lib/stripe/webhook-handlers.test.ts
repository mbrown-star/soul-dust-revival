import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type Db } from "@/lib/db/client";
import { bundleItems, entitlements, orders, orderItems, products, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";

// sendOrderConfirmationEmail/sendBundleShipmentNotificationEmail both call
// the real Resend API -- mocked so these tests never send a real email (or
// need a real RESEND_API_KEY).
vi.mock("@/lib/email/send", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendBundleShipmentNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const { handleCheckoutCompleted } = await import("./webhook-handlers");
const { sendOrderConfirmationEmail, sendBundleShipmentNotificationEmail } = await import("@/lib/email/send");

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

  describe("bundles", () => {
    it("a digital bundle grants an entitlement for every component, not for the bundle itself", async () => {
      const [componentA] = await db
        .insert(products)
        .values({ type: "study_access", format: "digital", title: "Component A", slug: `component-a-${randomUUID()}`, priceCents: 1000 })
        .returning();
      const [componentB] = await db
        .insert(products)
        .values({ type: "study_access", format: "digital", title: "Component B", slug: `component-b-${randomUUID()}`, priceCents: 1000 })
        .returning();
      const [bundle] = await db
        .insert(products)
        .values({ type: "bundle", format: "digital", title: "Digital Bundle", slug: `digital-bundle-${randomUUID()}`, priceCents: 1800 })
        .returning();
      await db.insert(bundleItems).values([
        { bundleProductId: bundle!.id, componentProductId: componentA!.id, orderIndex: 0 },
        { bundleProductId: bundle!.id, componentProductId: componentB!.id, orderIndex: 1 },
      ]);

      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.insert(orderItems).values({ orderId, productId: bundle!.id, quantity: 1 });

      try {
        await handleCheckoutCompleted(fakeCheckoutSession(orderId, { amount_total: 1800 }), "https://example.com");

        const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
        expect(grants.map((g) => g.productId).sort()).toEqual([componentA!.id, componentB!.id].sort());
        expect(sendBundleShipmentNotificationEmail).not.toHaveBeenCalled();
      } finally {
        await db.delete(entitlements).where(inArray(entitlements.productId, [componentA!.id, componentB!.id, bundle!.id]));
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(bundleItems).where(eq(bundleItems.bundleProductId, bundle!.id));
        await db.delete(products).where(inArray(products.id, [componentA!.id, componentB!.id, bundle!.id]));
      }
    });

    it("a component bought both inside a digital bundle and on its own still gets exactly one entitlement", async () => {
      const [component] = await db
        .insert(products)
        .values({ type: "study_access", format: "digital", title: "Shared Component", slug: `shared-component-${randomUUID()}`, priceCents: 1000 })
        .returning();
      const [bundle] = await db
        .insert(products)
        .values({ type: "bundle", format: "digital", title: "Digital Bundle", slug: `digital-bundle-${randomUUID()}`, priceCents: 1800 })
        .returning();
      await db.insert(bundleItems).values({ bundleProductId: bundle!.id, componentProductId: component!.id, orderIndex: 0 });

      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.insert(orderItems).values([
        { orderId, productId: bundle!.id, quantity: 1 },
        { orderId, productId: component!.id, quantity: 1 },
      ]);

      try {
        await handleCheckoutCompleted(fakeCheckoutSession(orderId, { amount_total: 2800 }), "https://example.com");

        const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
        expect(grants).toHaveLength(1);
        expect(grants[0]!.productId).toBe(component!.id);
      } finally {
        await db.delete(entitlements).where(inArray(entitlements.productId, [component!.id, bundle!.id]));
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(bundleItems).where(eq(bundleItems.bundleProductId, bundle!.id));
        await db.delete(products).where(inArray(products.id, [component!.id, bundle!.id]));
      }
    });

    it("a physical bundle sends the founder shipment-notification email and grants no entitlement", async () => {
      const [component] = await db
        .insert(products)
        .values({ type: "book", format: "physical", title: "Physical Component", slug: `physical-component-${randomUUID()}`, priceCents: 1500 })
        .returning();
      const [bundle] = await db
        .insert(products)
        .values({ type: "bundle", format: "physical", title: "Physical Bundle", slug: `physical-bundle-${randomUUID()}`, priceCents: 2500 })
        .returning();
      await db.insert(bundleItems).values({ bundleProductId: bundle!.id, componentProductId: component!.id, orderIndex: 0 });

      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.insert(orderItems).values({ orderId, productId: bundle!.id, quantity: 1 });

      try {
        await handleCheckoutCompleted(
          fakeCheckoutSession(orderId, {
            amount_total: 2500,
            shipping_details: { name: "Jane Reader", address: { line1: "1 Main St", line2: null, city: "Nashville", state: "TN", postal_code: "37201", country: "US" } },
          } as Partial<Stripe.Checkout.Session>),
          "https://example.com"
        );

        const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
        expect(grants).toHaveLength(0);

        expect(sendBundleShipmentNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendBundleShipmentNotificationEmail).toHaveBeenCalledWith(
          expect.objectContaining({
            bundles: [{ title: "Physical Bundle", quantity: 1 }],
            shippingName: "Jane Reader",
          })
        );
      } finally {
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(bundleItems).where(eq(bundleItems.bundleProductId, bundle!.id));
        await db.delete(products).where(inArray(products.id, [component!.id, bundle!.id]));
      }
    });

    it("a format \"both\" bundle cascades entitlements and sends the founder email, each from its own order-item variant", async () => {
      const [component] = await db
        .insert(products)
        .values({
          type: "study_access",
          format: "digital",
          title: "Both-bundle Component",
          slug: `both-bundle-component-${randomUUID()}`,
          priceCents: 1000,
        })
        .returning();
      const [bundle] = await db
        .insert(products)
        .values({
          type: "bundle",
          format: "both",
          title: "Both Bundle",
          slug: `both-bundle-${randomUUID()}`,
          priceCents: 8000,
          digitalPriceCents: 5000,
        })
        .returning();
      await db.insert(bundleItems).values({ bundleProductId: bundle!.id, componentProductId: component!.id, orderIndex: 0 });

      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      // One order containing both of the bundle's own independent purchase
      // routes -- a real customer buying the physical copy and digital
      // access together, same cart.
      await db.insert(orderItems).values([
        { orderId, productId: bundle!.id, quantity: 1, variant: "physical" },
        { orderId, productId: bundle!.id, quantity: 1, variant: "digital" },
      ]);

      try {
        await handleCheckoutCompleted(
          fakeCheckoutSession(orderId, {
            amount_total: 13000,
            shipping_details: { name: "Jane Reader", address: { line1: "1 Main St", line2: null, city: "Nashville", state: "TN", postal_code: "37201", country: "US" } },
          } as Partial<Stripe.Checkout.Session>),
          "https://example.com"
        );

        const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
        expect(grants).toHaveLength(1);
        expect(grants[0]!.productId).toBe(component!.id);

        expect(sendBundleShipmentNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendBundleShipmentNotificationEmail).toHaveBeenCalledWith(
          expect.objectContaining({ bundles: [{ title: "Both Bundle", quantity: 1 }] })
        );
      } finally {
        await db.delete(entitlements).where(inArray(entitlements.productId, [component!.id, bundle!.id]));
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(bundleItems).where(eq(bundleItems.bundleProductId, bundle!.id));
        await db.delete(products).where(inArray(products.id, [component!.id, bundle!.id]));
      }
    });

    it("a format \"both\" bundle bought only for its digital variant grants the cascade and sends no founder email", async () => {
      const [component] = await db
        .insert(products)
        .values({
          type: "study_access",
          format: "digital",
          title: "Both-bundle Digital-only Component",
          slug: `both-bundle-digital-only-${randomUUID()}`,
          priceCents: 1000,
        })
        .returning();
      const [bundle] = await db
        .insert(products)
        .values({
          type: "bundle",
          format: "both",
          title: "Both Bundle Digital Only",
          slug: `both-bundle-digital-only-${randomUUID()}`,
          priceCents: 8000,
          digitalPriceCents: 5000,
        })
        .returning();
      await db.insert(bundleItems).values({ bundleProductId: bundle!.id, componentProductId: component!.id, orderIndex: 0 });

      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.insert(orderItems).values({ orderId, productId: bundle!.id, quantity: 1, variant: "digital" });

      try {
        await handleCheckoutCompleted(fakeCheckoutSession(orderId, { amount_total: 5000 }), "https://example.com");

        const grants = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
        expect(grants.map((g) => g.productId)).toEqual([component!.id]);
        expect(sendBundleShipmentNotificationEmail).not.toHaveBeenCalled();
      } finally {
        await db.delete(entitlements).where(inArray(entitlements.productId, [component!.id, bundle!.id]));
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(bundleItems).where(eq(bundleItems.bundleProductId, bundle!.id));
        await db.delete(products).where(inArray(products.id, [component!.id, bundle!.id]));
      }
    });

    it("does not send the bundle shipment email for a digital bundle", async () => {
      const [component] = await db
        .insert(products)
        .values({ type: "study_access", format: "digital", title: "Digital-only Component", slug: `digital-only-${randomUUID()}`, priceCents: 1000 })
        .returning();
      const [bundle] = await db
        .insert(products)
        .values({ type: "bundle", format: "digital", title: "Digital Bundle", slug: `digital-bundle-${randomUUID()}`, priceCents: 1800 })
        .returning();
      await db.insert(bundleItems).values({ bundleProductId: bundle!.id, componentProductId: component!.id, orderIndex: 0 });

      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.insert(orderItems).values({ orderId, productId: bundle!.id, quantity: 1 });

      try {
        await handleCheckoutCompleted(fakeCheckoutSession(orderId, { amount_total: 1800 }), "https://example.com");
        expect(sendBundleShipmentNotificationEmail).not.toHaveBeenCalled();
      } finally {
        await db.delete(entitlements).where(inArray(entitlements.productId, [component!.id, bundle!.id]));
        await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await db.delete(bundleItems).where(eq(bundleItems.bundleProductId, bundle!.id));
        await db.delete(products).where(inArray(products.id, [component!.id, bundle!.id]));
      }
    });
  });
});
