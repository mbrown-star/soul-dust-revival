import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type Db } from "@/lib/db/client";
import { entitlements, lessons, products, studies, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getLessonAccess, hasEntitlement, studyHasOpenSample } from "./check";

// Runs against the real local Postgres (see BUILD_TASKS.md) -- entitlement
// logic is a direct DB read with no mockable boundary worth faking.
describe("hasEntitlement", () => {
  let userId: string;
  let productId: string;
  let db: Db;

  beforeEach(async () => {
    db = await getDb();
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

describe("getLessonAccess / studyHasOpenSample (free sample)", () => {
  let db: Db;
  let userId: string;
  let adminId: string;
  let productId: string;
  let studyId: string;

  const publishedStudy = () => ({ productId, published: true });
  const sample = { isSample: true, published: true };
  const locked = { isSample: false, published: true };

  beforeEach(async () => {
    db = await getDb();
    const [user] = await db.insert(users).values({ email: `sample-${randomUUID()}@example.com`, role: "user" }).returning();
    const [admin] = await db.insert(users).values({ email: `sample-${randomUUID()}@example.com`, role: "admin" }).returning();
    const [product] = await db
      .insert(products)
      .values({ type: "study_access", format: "digital", title: "Sample Study", slug: `sample-${randomUUID()}`, priceCents: 2900 })
      .returning();
    const [study] = await db
      .insert(studies)
      .values({ productId: product!.id, title: "Sample Study", slug: `sample-study-${randomUUID()}`, published: true })
      .returning();
    userId = user!.id;
    adminId = admin!.id;
    productId = product!.id;
    studyId = study!.id;
  });

  afterEach(async () => {
    await db.delete(lessons).where(eq(lessons.studyId, studyId));
    await db.delete(studies).where(eq(studies.id, studyId));
    await db.delete(entitlements).where(eq(entitlements.productId, productId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(users).where(inArray(users.id, [userId, adminId]));
  });

  it("opens a published sample lesson to a reader who doesn't own the study, marked sampleOnly", async () => {
    const access = await getLessonAccess({ userId, email: "x" }, publishedStudy(), sample);
    expect(access).toEqual({ allowed: true, isAdminPreview: false, sampleOnly: true });
  });

  it("keeps a non-sample lesson of the same study locked for that reader", async () => {
    const access = await getLessonAccess({ userId, email: "x" }, publishedStudy(), locked);
    expect(access.allowed).toBe(false);
  });

  it("keeps an unpublished sample lesson, or any lesson of an unpublished study, locked", async () => {
    expect((await getLessonAccess({ userId, email: "x" }, publishedStudy(), { isSample: true, published: false })).allowed).toBe(false);
    expect((await getLessonAccess({ userId, email: "x" }, { productId, published: false }, sample)).allowed).toBe(false);
  });

  it("gives an owner every lesson, not as a sample", async () => {
    await db.insert(entitlements).values({ userId, productId, source: "purchase" });
    const access = await getLessonAccess({ userId, email: "x" }, publishedStudy(), locked);
    expect(access).toEqual({ allowed: true, isAdminPreview: false, sampleOnly: false });
  });

  it("gives an admin every lesson as a preview, not as a sample", async () => {
    const access = await getLessonAccess({ userId: adminId, email: "x" }, publishedStudy(), locked);
    expect(access).toEqual({ allowed: true, isAdminPreview: true, sampleOnly: false });
  });

  it("studyHasOpenSample only counts published sample lessons of a published study", async () => {
    await db.insert(lessons).values({ studyId, orderIndex: 0, title: "Week 1", published: false, isSample: true });
    expect(await studyHasOpenSample({ id: studyId, published: true })).toBe(false);
    await db.insert(lessons).values({ studyId, orderIndex: 1, title: "Week 2", published: true, isSample: true });
    expect(await studyHasOpenSample({ id: studyId, published: true })).toBe(true);
    expect(await studyHasOpenSample({ id: studyId, published: false })).toBe(false);
  });
});
