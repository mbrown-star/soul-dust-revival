import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import {
  studies,
  products,
  users,
  lessons,
  contentBlocks,
  lessonProgress,
  responses,
  orders,
  orderItems,
  entitlements,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { DELETE } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

function deleteRequest(id: string) {
  return new NextRequest("https://example.com/api/admin/studies", {
    method: "DELETE",
    body: JSON.stringify({ id }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin studies route — delete", () => {
  let adminUserId: string;
  let productId: string;
  let db: Db;

  async function signInAsAdmin() {
    db = await getDb();
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${randomUUID()}@example.com`, role: "admin" })
      .returning();
    adminUserId = admin!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminUserId, email: "admin@example.com", role: "admin" });

    const [product] = await db
      .insert(products)
      .values({
        type: "study_access",
        format: "digital",
        title: "Study Access Product",
        slug: `study-access-${randomUUID()}`,
        priceCents: 2900,
      })
      .returning();
    productId = product!.id;
  }

  afterEach(async () => {
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    vi.mocked(requireAdmin).mockReset();
  });

  it("deletes a study with no lessons", async () => {
    await signInAsAdmin();
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Empty Study", slug: `empty-study-${randomUUID()}`, published: false })
      .returning();

    const res = await DELETE(deleteRequest(study!.id));
    expect(res.status).toBe(200);

    const [stillThere] = await db.select().from(studies).where(eq(studies.id, study!.id));
    expect(stillThere).toBeUndefined();
  });

  it("cascades through lessons, content blocks, progress, and responses", async () => {
    await signInAsAdmin();
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Full Study", slug: `full-study-${randomUUID()}`, published: false })
      .returning();
    const [lesson] = await db
      .insert(lessons)
      .values({ studyId: study!.id, orderIndex: 0, title: "Lesson 1" })
      .returning();
    const [block] = await db
      .insert(contentBlocks)
      .values({ lessonId: lesson!.id, orderIndex: 0, type: "text", body: "<p>hi</p>" })
      .returning();
    await db.insert(lessonProgress).values({ userId: adminUserId, lessonId: lesson!.id, status: "completed" });
    await db.insert(responses).values({ userId: adminUserId, contentBlockId: block!.id, answerText: "an answer" });

    const res = await DELETE(deleteRequest(study!.id));
    expect(res.status).toBe(200);

    const [studyRow] = await db.select().from(studies).where(eq(studies.id, study!.id));
    const [lessonRow] = await db.select().from(lessons).where(eq(lessons.id, lesson!.id));
    const [blockRow] = await db.select().from(contentBlocks).where(eq(contentBlocks.id, block!.id));
    const progressRows = await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, lesson!.id));
    const responseRows = await db.select().from(responses).where(eq(responses.contentBlockId, block!.id));

    expect(studyRow).toBeUndefined();
    expect(lessonRow).toBeUndefined();
    expect(blockRow).toBeUndefined();
    expect(progressRows).toHaveLength(0);
    expect(responseRows).toHaveLength(0);
  });

  it("rejects when not an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const res = await DELETE(deleteRequest(randomUUID()));
    expect(res.status).toBe(403);
  });

  it("refuses to delete a study whose product has order history", async () => {
    await signInAsAdmin();
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Sold Study", slug: `sold-study-${randomUUID()}`, published: false })
      .returning();
    const [order] = await db.insert(orders).values({ country: "US", status: "paid", totalCents: 2900 }).returning();
    await db.insert(orderItems).values({ orderId: order!.id, productId, quantity: 1 });

    try {
      const res = await DELETE(deleteRequest(study!.id));
      expect(res.status).toBe(409);

      const [stillThere] = await db.select().from(studies).where(eq(studies.id, study!.id));
      expect(stillThere).toBeDefined();
    } finally {
      await db.delete(orderItems).where(eq(orderItems.orderId, order!.id));
      await db.delete(orders).where(eq(orders.id, order!.id));
      await db.delete(studies).where(eq(studies.id, study!.id));
    }
  });

  it("refuses to delete a study whose product has a granted entitlement", async () => {
    await signInAsAdmin();
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Granted Study", slug: `granted-study-${randomUUID()}`, published: false })
      .returning();
    await db.insert(entitlements).values({ userId: adminUserId, productId, source: "admin_grant" });

    try {
      const res = await DELETE(deleteRequest(study!.id));
      expect(res.status).toBe(409);
    } finally {
      await db.delete(entitlements).where(eq(entitlements.productId, productId));
      await db.delete(studies).where(eq(studies.id, study!.id));
    }
  });
});
