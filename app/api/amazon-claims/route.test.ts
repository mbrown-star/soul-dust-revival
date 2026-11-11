import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { amazonClaims, entitlements, products, studies, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST } = await import("./route");
const { PATCH } = await import("../admin/amazon-claims/route");
const { getSession } = await import("@/lib/auth/session");
const { MAX_CLAIMS_PER_DAY } = await import("@/lib/commerce/amazonClaims");
const { requireAdmin } = await import("@/lib/admin/guard");

const ORDER = "112-1234567-1234567";

function request(method: "POST" | "PATCH", body: unknown) {
  return new NextRequest("https://example.com/api/amazon-claims", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("Amazon claims", () => {
  let db: Db;
  let userId: string;
  let otherUserId: string;
  let bookId: string;
  let noStudyBookId: string;
  let notOnAmazonId: string;
  const productIds: string[] = [];

  async function product(values: Partial<typeof products.$inferInsert>) {
    const [row] = await db
      .insert(products)
      .values({
        type: "book",
        format: "physical",
        title: "Printed Book",
        slug: `claim-test-${randomUUID()}`,
        priceCents: 1899,
        sellOnStripe: false,
        sellOnAmazon: true,
        amazonUrl: "https://www.amazon.com/dp/TEST",
        ...values,
      })
      .returning();
    productIds.push(row!.id);
    return row!.id;
  }

  beforeEach(async () => {
    db = await getDb();
    vi.mocked(getSession).mockReset();
    vi.mocked(requireAdmin).mockReset();
    productIds.length = 0;

    const [user] = await db.insert(users).values({ email: `claim-${randomUUID()}@example.com` }).returning();
    const [other] = await db.insert(users).values({ email: `claim-${randomUUID()}@example.com` }).returning();
    userId = user!.id;
    otherUserId = other!.id;

    bookId = await product({ title: "Colossians" });
    noStudyBookId = await product({ title: "No Study" });
    notOnAmazonId = await product({ title: "Not On Amazon", sellOnAmazon: false, amazonUrl: null, sellOnStripe: true });
    await db.insert(studies).values([
      { productId: bookId, title: "Colossians study", slug: `claim-study-${randomUUID()}` },
      { productId: notOnAmazonId, title: "Other study", slug: `claim-study-${randomUUID()}` },
    ]);

    vi.mocked(getSession).mockResolvedValue({ userId, email: "reader@example.com" });
  });

  afterEach(async () => {
    await db.delete(amazonClaims).where(inArray(amazonClaims.productId, productIds));
    await db.delete(entitlements).where(inArray(entitlements.productId, productIds));
    await db.delete(studies).where(inArray(studies.productId, productIds));
    await db.delete(products).where(inArray(products.id, productIds));
    await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
  });

  it("refuses a signed-out visitor", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(request("POST", { productId: bookId, orderNumber: ORDER }));
    expect(res.status).toBe(401);
  });

  it("unlocks the digital edition and records the claim, normalizing the order number", async () => {
    const res = await POST(request("POST", { productId: bookId, orderNumber: " 112 1234567 1234567 " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "claimed", productTitle: "Colossians", ready: false });

    const [grant] = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
    expect(grant).toMatchObject({ productId: bookId, source: "amazon_claim", expiresAt: null });
    const [claim] = await db.select().from(amazonClaims).where(eq(amazonClaims.userId, userId));
    expect(claim).toMatchObject({ productId: bookId, amazonOrderNumber: ORDER, entitlementId: grant!.id, revokedAt: null });
  });

  it("says the book is ready once its study is published", async () => {
    await db.update(studies).set({ published: true }).where(eq(studies.productId, bookId));
    const res = await POST(request("POST", { productId: bookId, orderNumber: ORDER }));
    expect(await res.json()).toEqual({ status: "claimed", productTitle: "Colossians", ready: true });
  });

  it("refuses something that isn't an Amazon order number", async () => {
    const res = await POST(request("POST", { productId: bookId, orderNumber: "12345" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { message: string }).message).toMatch(/Amazon order number/);
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, userId))).toHaveLength(0);
  });

  it("refuses a title with nothing to read, or one not sold on Amazon", async () => {
    for (const productId of [noStudyBookId, notOnAmazonId]) {
      const res = await POST(request("POST", { productId, orderNumber: ORDER }));
      expect(res.status).toBe(400);
    }
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, userId))).toHaveLength(0);
  });

  it("lets one order number claim one title once, so it can't unlock a second account", async () => {
    expect((await POST(request("POST", { productId: bookId, orderNumber: ORDER }))).status).toBe(200);

    vi.mocked(getSession).mockResolvedValue({ userId: otherUserId, email: "other@example.com" });
    const res = await POST(request("POST", { productId: bookId, orderNumber: "112-1234567-1234567" }));
    expect(res.status).toBe(409);
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, otherUserId))).toHaveLength(0);
  });

  it("says so when the reader already owns it, without using up the order number", async () => {
    await db.insert(entitlements).values({ userId, productId: bookId, source: "purchase" });
    const res = await POST(request("POST", { productId: bookId, orderNumber: ORDER }));
    expect(await res.json()).toEqual({ status: "already_owned", productTitle: "Colossians", ready: false });
    expect(await db.select().from(amazonClaims).where(eq(amazonClaims.productId, bookId))).toHaveLength(0);
  });

  it("stops one account after a day's worth of claims", async () => {
    // Already at the cap today (on other titles, as far as this check cares).
    const others = await Promise.all(Array.from({ length: MAX_CLAIMS_PER_DAY }, () => product({ title: "Other" })));
    await db.insert(amazonClaims).values(
      others.map((productId, i) => ({ userId, productId, amazonOrderNumber: `111-0000000-${String(i).padStart(7, "0")}` }))
    );

    const res = await POST(request("POST", { productId: bookId, orderNumber: ORDER }));
    expect(res.status).toBe(429);
    expect(await db.select().from(entitlements).where(eq(entitlements.userId, userId))).toHaveLength(0);
  });

  describe("revoking (admin)", () => {
    it("refuses a non-admin", async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      const res = await PATCH(request("PATCH", { id: randomUUID() }));
      expect(res.status).toBe(403);
    });

    it("removes the access, keeps the claim as revoked, and the number stays used", async () => {
      await POST(request("POST", { productId: bookId, orderNumber: ORDER }));
      const [claim] = await db.select().from(amazonClaims).where(eq(amazonClaims.userId, userId));
      vi.mocked(requireAdmin).mockResolvedValue({ userId: otherUserId, email: "admin@example.com" } as never);

      const res = await PATCH(request("PATCH", { id: claim!.id }));
      expect(res.status).toBe(200);
      expect(await db.select().from(entitlements).where(eq(entitlements.userId, userId))).toHaveLength(0);
      const [after] = await db.select().from(amazonClaims).where(eq(amazonClaims.id, claim!.id));
      expect(after!.revokedAt).not.toBeNull();
      expect(after!.revokedByUserId).toBe(otherUserId);
      expect(after!.entitlementId).toBeNull();

      // Revoking again finds nothing to revoke.
      expect((await PATCH(request("PATCH", { id: claim!.id }))).status).toBe(404);
      // The same number can't simply be claimed again.
      expect((await POST(request("POST", { productId: bookId, orderNumber: ORDER }))).status).toBe(409);
    });

    it("leaves access the reader has from somewhere else alone", async () => {
      await POST(request("POST", { productId: bookId, orderNumber: ORDER }));
      const [claim] = await db.select().from(amazonClaims).where(eq(amazonClaims.userId, userId));
      // e.g. they later bought the digital edition too.
      const [purchase] = await db
        .insert(entitlements)
        .values({ userId, productId: bookId, source: "purchase" })
        .returning();
      vi.mocked(requireAdmin).mockResolvedValue({ userId: otherUserId, email: "admin@example.com" } as never);

      await PATCH(request("PATCH", { id: claim!.id }));
      const left = await db.select().from(entitlements).where(eq(entitlements.userId, userId));
      expect(left.map((e) => e.id)).toEqual([purchase!.id]);
    });
  });
});
