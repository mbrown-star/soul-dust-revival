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
vi.mock("@/lib/stripe/products", () => ({ getOrCreateStripePrice: vi.fn().mockResolvedValue("price_fake") }));

const { POST } = await import("./route");
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
});
