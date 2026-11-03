import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { entitlements, products, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hasEntitlement } from "./check";

// Runs against the real local Postgres (see BUILD_TASKS.md) -- entitlement
// logic is a direct DB read with no mockable boundary worth faking.
describe("hasEntitlement", () => {
  let userId: string;
  let productId: string;

  beforeEach(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `test-${randomUUID()}@example.com`, role: "user" })
      .returning();
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
    userId = user!.id;
    productId = product!.id;
  });

  afterEach(async () => {
    await db.delete(entitlements).where(eq(entitlements.userId, userId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("returns false when no entitlement exists", async () => {
    expect(await hasEntitlement(userId, productId)).toBe(false);
  });

  it("returns true for a permanent entitlement (expiresAt null)", async () => {
    await db.insert(entitlements).values({ userId, productId, source: "purchase", expiresAt: null });
    expect(await hasEntitlement(userId, productId)).toBe(true);
  });

  it("returns true for an entitlement that hasn't expired yet", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await db.insert(entitlements).values({ userId, productId, source: "trial", expiresAt: futureDate });
    expect(await hasEntitlement(userId, productId)).toBe(true);
  });

  it("returns false for an entitlement that has already expired", async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
    await db.insert(entitlements).values({ userId, productId, source: "trial", expiresAt: pastDate });
    expect(await hasEntitlement(userId, productId)).toBe(false);
  });

  it("does not grant access to a different user's entitlement", async () => {
    const [otherUser] = await db
      .insert(users)
      .values({ email: `test-other-${randomUUID()}@example.com`, role: "user" })
      .returning();
    await db.insert(entitlements).values({ userId: otherUser!.id, productId, source: "purchase", expiresAt: null });

    try {
      expect(await hasEntitlement(userId, productId)).toBe(false);
    } finally {
      await db.delete(entitlements).where(eq(entitlements.userId, otherUser!.id));
      await db.delete(users).where(eq(users.id, otherUser!.id));
    }
  });
});
