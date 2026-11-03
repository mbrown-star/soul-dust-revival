import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
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
  let createdOrderIds: string[];

  beforeEach(async () => {
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

    createdOrderIds = [];
  });

  afterEach(async () => {
    for (const orderId of createdOrderIds) {
      await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
      await db.delete(orders).where(eq(orders.id, orderId));
    }
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

    const [order] = await db.select().from(orders).where(eq(orders.totalCents, 2900));
    expect(order).toBeDefined();
    createdOrderIds.push(order!.id);
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
});
