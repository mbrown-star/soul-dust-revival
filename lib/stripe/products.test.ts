import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type Db } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Mocked so these tests never call the real Stripe API or need a real
// STRIPE_SECRET_KEY -- the behavior under test is the DB-side atomic claim,
// not Stripe's own product/price creation.
vi.mock("./client", () => ({
  stripe: {
    products: { create: vi.fn() },
    prices: { create: vi.fn() },
  },
}));

const { getOrCreateStripePrice } = await import("./products");
const { stripe } = await import("./client");

describe("getOrCreateStripePrice", () => {
  let productId: string;
  let db: Db;

  beforeEach(async () => {
    db = await getDb();
    vi.mocked(stripe.products.create).mockReset();
    vi.mocked(stripe.prices.create).mockReset();

    const [product] = await db
      .insert(products)
      .values({
        type: "study_access",
        format: "digital",
        title: "Test Study",
        slug: `test-study-${randomUUID()}`,
        priceCents: 2900,
      })
      .returning();
    productId = product!.id;
  });

  afterEach(async () => {
    await db.delete(products).where(eq(products.id, productId));
  });

  it("returns the existing stripePriceId without calling Stripe when already set", async () => {
    await db.update(products).set({ stripePriceId: "price_existing" }).where(eq(products.id, productId));

    const result = await getOrCreateStripePrice(productId);

    expect(result).toBe("price_existing");
    expect(stripe.products.create).not.toHaveBeenCalled();
  });

  it("creates a Stripe product/price and persists both IDs on first use", async () => {
    vi.mocked(stripe.products.create).mockResolvedValue({ id: "prod_new" } as never);
    vi.mocked(stripe.prices.create).mockResolvedValue({ id: "price_new" } as never);

    const result = await getOrCreateStripePrice(productId);

    expect(result).toBe("price_new");
    const [updated] = await db.select().from(products).where(eq(products.id, productId));
    expect(updated!.stripeProductId).toBe("prod_new");
    expect(updated!.stripePriceId).toBe("price_new");
  });

  it("throws for an unknown productId", async () => {
    await expect(getOrCreateStripePrice(randomUUID())).rejects.toThrow("not found");
  });

  // Regression test for the race condition fixed earlier: two concurrent
  // first-time checkouts of the same just-created product used to be able to
  // each create their own Stripe Product+Price, leaving the DB pointing at
  // whichever write landed last -- silently orphaning the other Stripe price.
  it("under a concurrent race, both callers settle on the same winning price", async () => {
    let callCount = 0;
    vi.mocked(stripe.products.create).mockImplementation(async () => {
      callCount++;
      return { id: `prod_${callCount}` } as never;
    });
    vi.mocked(stripe.prices.create).mockImplementation(async () => {
      return { id: `price_${callCount}` } as never;
    });

    const [a, b] = await Promise.all([getOrCreateStripePrice(productId), getOrCreateStripePrice(productId)]);

    expect(a).toBe(b); // both callers must agree on one winner

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row!.stripePriceId).toBe(a); // the DB reflects that same winner, not a different loser
  });
});
