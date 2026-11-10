import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { orderItems, orders, products, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/stripe/client", () => ({
  stripe: { checkout: { sessions: { create: vi.fn() } } },
}));
vi.mock("@/lib/stripe/products", async () => {
  const actual = await vi.importActual<typeof import("@/lib/stripe/products")>("@/lib/stripe/products");
  return { ...actual, getOrCreateStripePrice: vi.fn().mockResolvedValue("price_fake") };
});
// The launch mode is baked in at build time; mocked so one case can run as
// the sneak-peek build. Everything else runs as the full site.
vi.mock("@/lib/launchMode", () => ({ isSneakPeek: vi.fn().mockReturnValue(false) }));

const { POST } = await import("./route");
const { isSneakPeek } = await import("@/lib/launchMode");
const { getSession } = await import("@/lib/auth/session");
const { stripe } = await import("@/lib/stripe/client");

function checkoutRequest(body: unknown) {
  return new NextRequest("https://example.com/api/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/checkout", () => {
  let digitalProductId: string;
  let userId: string;
  let db: Db;

  beforeEach(async () => {
    db = await getDb();
    vi.mocked(getSession).mockReset();
    vi.mocked(stripe.checkout.sessions.create).mockReset();
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: "cs_fake",
      url: "https://checkout.stripe.com/fake",
    } as never);

    const [product] = await db
      .insert(products)
      .values({
        type: "study_access",
        format: "digital",
        title: "Test Study",
        slug: `test-study-${randomUUID()}`,
        priceCents: 2900, // the real, server-side price
        active: true,
      })
      .returning();
    digitalProductId = product!.id;

    const [user] = await db
      .insert(users)
      .values({ email: `test-${randomUUID()}@example.com`, role: "user" })
      .returning();
    userId = user!.id;
  });

  afterEach(async () => {
    // Scoped by userId (not a tracked-order-id array) so cleanup can never
    // be skipped by an assertion throwing before an id gets recorded --
    // every order this suite creates belongs to this test's own userId.
    await db.delete(orderItems).where(eq(orderItems.productId, digitalProductId));
    await db.delete(orders).where(eq(orders.userId, userId));
    await db.delete(products).where(eq(products.id, digitalProductId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("prices the order from the DB, ignoring any price the client sends", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId, email: "buyer@example.com" });

    // A tampered client payload trying to check out at $0.01 instead of the
    // real $29.00 -- the schema doesn't even have a price field, so this
    // extra key is just discarded, but this test proves the *order total*
    // actually reflects the DB price, not merely that the field is ignored.
    const res = await POST(
      checkoutRequest({
        items: [{ productId: digitalProductId, quantity: 1, priceCents: 1 }],
        country: "US",
      })
    );

    expect(res.status).toBe(200);

    // Scoped by this test's own userId, not just the price -- matching on
    // totalCents alone isn't unique and can grab an unrelated order if one
    // happens to exist with the same total.
    const [order] = await db.select().from(orders).where(eq(orders.userId, userId));
    expect(order).toBeDefined();
    expect(order!.totalCents).toBe(2900);
  });

  it("refuses every checkout on the sneak-peek site, before creating an order or a Stripe session", async () => {
    vi.mocked(isSneakPeek).mockReturnValueOnce(true);
    vi.mocked(getSession).mockResolvedValue({ userId, email: "buyer@example.com" });

    const res = await POST(
      checkoutRequest({ items: [{ productId: digitalProductId, quantity: 1 }], country: "US" })
    );

    expect(res.status).toBe(404);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(await db.select().from(orders).where(eq(orders.userId, userId))).toHaveLength(0);
  });

  it("requires login for a cart containing digital content", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(
      checkoutRequest({ items: [{ productId: digitalProductId, quantity: 1 }], country: "US" })
    );

    expect(res.status).toBe(401);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("rejects a cart referencing a product ID that doesn't exist", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: randomUUID(), email: "buyer@example.com" });

    const res = await POST(
      checkoutRequest({ items: [{ productId: randomUUID(), quantity: 1 }], country: "US" })
    );

    expect(res.status).toBe(400);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("rejects malformed input that doesn't match the schema", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: randomUUID(), email: "buyer@example.com" });

    const res = await POST(checkoutRequest({ items: [], country: "US" }));

    expect(res.status).toBe(400);
  });

  it("rejects checkout for a product an admin has marked Amazon-exclusive (sellOnStripe: false)", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId: randomUUID(), email: "buyer@example.com" });

    const [amazonOnlyProduct] = await db
      .insert(products)
      .values({
        type: "book",
        format: "physical",
        title: "Amazon-only Book",
        slug: `amazon-only-${randomUUID()}`,
        priceCents: 1999,
        active: true,
        sellOnStripe: false,
        amazonUrl: "https://www.amazon.com/dp/B000000000",
      })
      .returning();

    try {
      const res = await POST(
        checkoutRequest({ items: [{ productId: amazonOnlyProduct!.id, quantity: 1 }], country: "US" })
      );

      expect(res.status).toBe(400);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    } finally {
      await db.delete(products).where(eq(products.id, amazonOnlyProduct!.id));
    }
  });

  describe("format: \"both\" products", () => {
    async function makeBothProduct() {
      const [product] = await db
        .insert(products)
        .values({
          type: "book",
          format: "both",
          title: "Both Format Book",
          slug: `both-format-${randomUUID()}`,
          priceCents: 1999, // physical
          digitalPriceCents: 999, // digital
          active: true,
        })
        .returning();
      return product!;
    }

    it("rejects a line item with no variant", async () => {
      vi.mocked(getSession).mockResolvedValue({ userId: randomUUID(), email: "buyer@example.com" });
      const product = await makeBothProduct();
      try {
        const res = await POST(checkoutRequest({ items: [{ productId: product.id, quantity: 1 }], country: "US" }));
        expect(res.status).toBe(400);
      } finally {
        await db.delete(products).where(eq(products.id, product.id));
      }
    });

    it("rejects a variant on a product that isn't format \"both\"", async () => {
      vi.mocked(getSession).mockResolvedValue({ userId, email: "buyer@example.com" });
      const res = await POST(
        checkoutRequest({
          items: [{ productId: digitalProductId, quantity: 1, variant: "digital" }],
          country: "US",
        })
      );
      expect(res.status).toBe(400);
    });

    it("prices the digital variant from digitalPriceCents, not priceCents", async () => {
      vi.mocked(getSession).mockResolvedValue({ userId, email: "buyer@example.com" });
      const product = await makeBothProduct();
      try {
        const res = await POST(
          checkoutRequest({
            items: [{ productId: product.id, quantity: 1, variant: "digital" }],
            country: "US",
          })
        );
        expect(res.status).toBe(200);
        const [order] = await db.select().from(orders).where(eq(orders.userId, userId));
        expect(order!.totalCents).toBe(999);
        await db.delete(orderItems).where(eq(orderItems.orderId, order!.id));
        await db.delete(orders).where(eq(orders.id, order!.id));
      } finally {
        await db.delete(products).where(eq(products.id, product.id));
      }
    });

    it("prices the physical variant from priceCents and requires shipping", async () => {
      vi.mocked(getSession).mockResolvedValue({ userId, email: "buyer@example.com" });
      const product = await makeBothProduct();
      try {
        const res = await POST(
          checkoutRequest({
            items: [{ productId: product.id, quantity: 1, variant: "physical" }],
            country: "US",
          })
        );
        expect(res.status).toBe(200);
        const [order] = await db.select().from(orders).where(eq(orders.userId, userId));
        expect(order!.totalCents).toBe(1999);
        expect(order!.requiresShipping).toBe(true);
        await db.delete(orderItems).where(eq(orderItems.orderId, order!.id));
        await db.delete(orders).where(eq(orders.id, order!.id));
      } finally {
        await db.delete(products).where(eq(products.id, product.id));
      }
    });

    it("returns a clean 400 instead of crashing if a \"both\" product's digitalPriceCents is somehow null", async () => {
      vi.mocked(getSession).mockResolvedValue({ userId, email: "buyer@example.com" });
      // productSchema's .refine() requires digitalPriceCents for format
      // "both" at the admin-write boundary, but the column itself is
      // nullable -- simulate an old/directly-written row that predates it.
      const [product] = await db
        .insert(products)
        .values({
          type: "book",
          format: "both",
          title: "Both Format, No Digital Price",
          slug: `both-format-no-price-${randomUUID()}`,
          priceCents: 1999,
          digitalPriceCents: null,
          active: true,
        })
        .returning();
      try {
        const res = await POST(
          checkoutRequest({
            items: [{ productId: product!.id, quantity: 1, variant: "digital" }],
            country: "US",
          })
        );
        expect(res.status).toBe(400);
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      } finally {
        await db.delete(products).where(eq(products.id, product!.id));
      }
    });
  });

  it("merges duplicate line items sharing the same {productId, variant} instead of double-charging", async () => {
    vi.mocked(getSession).mockResolvedValue({ userId, email: "buyer@example.com" });
    // A direct API call (bypassing the cart UI's own client-side merge) can
    // split the same item across two lines -- the webhook's entitlement
    // grant dedupes by product either way, so if checkout didn't also merge,
    // the customer would be charged twice for a single entitlement.
    const res = await POST(
      checkoutRequest({
        items: [
          { productId: digitalProductId, quantity: 1 },
          { productId: digitalProductId, quantity: 2 },
        ],
        country: "US",
      })
    );
    expect(res.status).toBe(200);
    const [order] = await db.select().from(orders).where(eq(orders.userId, userId));
    expect(order!.totalCents).toBe(2900 * 3); // merged quantity (1 + 2), not double-charged as two separate lines
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(3);
    const lastCall = vi.mocked(stripe.checkout.sessions.create).mock.calls.at(-1);
    const params = lastCall?.[0] as { line_items: unknown[] } | undefined;
    expect(params?.line_items).toHaveLength(1);
    await db.delete(orderItems).where(eq(orderItems.orderId, order!.id));
    await db.delete(orders).where(eq(orders.id, order!.id));
  });
});
