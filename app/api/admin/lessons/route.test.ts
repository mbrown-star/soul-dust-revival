import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { studies, products, users, lessons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { POST, PATCH } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

function patchRequest(body: unknown) {
  return new NextRequest("https://example.com/api/admin/lessons", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin lessons route", () => {
  let adminUserId: string;
  let productId: string;
  let studyId: string;
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

    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Imported Study", slug: `imported-study-${randomUUID()}`, published: false })
      .returning();
    studyId = study!.id;
  }

  afterEach(async () => {
    if (studyId) await db.delete(lessons).where(eq(lessons.studyId, studyId));
    if (studyId) await db.delete(studies).where(eq(studies.id, studyId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    vi.mocked(requireAdmin).mockReset();
  });

  it("rejects a bulk publish request when not an admin", async () => {
    await signInAsAdmin();
    vi.mocked(requireAdmin).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ studyId, published: true }));
    expect(res.status).toBe(403);
  });

  it("publishes every lesson in a study in one request", async () => {
    await signInAsAdmin();

    const inserted = await db
      .insert(lessons)
      .values(
        Array.from({ length: 5 }, (_, i) => ({
          studyId,
          title: `Day ${i + 1}`,
          orderIndex: i,
          published: false,
        }))
      )
      .returning();
    expect(inserted).toHaveLength(5);

    const res = await PATCH(patchRequest({ studyId, published: true }));
    expect(res.status).toBe(200);

    const updated = await db.select().from(lessons).where(eq(lessons.studyId, studyId));
    expect(updated).toHaveLength(5);
    expect(updated.every((l) => l.published)).toBe(true);
  });

  it("unpublishes every lesson in a study in one request", async () => {
    await signInAsAdmin();

    await db.insert(lessons).values(
      Array.from({ length: 3 }, (_, i) => ({
        studyId,
        title: `Day ${i + 1}`,
        orderIndex: i,
        published: true,
      }))
    );

    const res = await PATCH(patchRequest({ studyId, published: false }));
    expect(res.status).toBe(200);

    const updated = await db.select().from(lessons).where(eq(lessons.studyId, studyId));
    expect(updated.every((l) => !l.published)).toBe(true);
  });

  it("doesn't touch another study's lessons when bulk-publishing", async () => {
    await signInAsAdmin();

    const [otherStudy] = await db
      .insert(studies)
      .values({ productId, title: "Other Study", slug: `other-study-${randomUUID()}`, published: false })
      .returning();

    await db.insert(lessons).values({ studyId, title: "Mine", orderIndex: 0, published: false });
    const [otherLesson] = await db
      .insert(lessons)
      .values({ studyId: otherStudy!.id, title: "Not mine", orderIndex: 0, published: false })
      .returning();

    try {
      const res = await PATCH(patchRequest({ studyId, published: true }));
      expect(res.status).toBe(200);

      const [stillUnpublished] = await db.select().from(lessons).where(eq(lessons.id, otherLesson!.id));
      expect(stillUnpublished!.published).toBe(false);
    } finally {
      await db.delete(lessons).where(eq(lessons.studyId, otherStudy!.id));
      await db.delete(studies).where(eq(studies.id, otherStudy!.id));
    }
  });

  it("still supports creating a single lesson (POST) unaffected by the new bulk-publish branch", async () => {
    await signInAsAdmin();

    const res = await POST(
      new NextRequest("https://example.com/api/admin/lessons", {
        method: "POST",
        body: JSON.stringify({ studyId, title: "Week 1" }),
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; published: boolean };
    expect(json.published).toBe(false);
  });

  it("still supports the existing bulk reorder action unaffected by the new bulk-publish branch", async () => {
    await signInAsAdmin();

    const inserted = await db
      .insert(lessons)
      .values([
        { studyId, title: "First", orderIndex: 0, published: false },
        { studyId, title: "Second", orderIndex: 1, published: false },
      ])
      .returning();

    const res = await PATCH(
      patchRequest({
        reorder: [
          { id: inserted[0]!.id, orderIndex: 1 },
          { id: inserted[1]!.id, orderIndex: 0 },
        ],
      })
    );
    expect(res.status).toBe(200);

    const [first] = await db.select().from(lessons).where(eq(lessons.id, inserted[0]!.id));
    expect(first!.orderIndex).toBe(1);
  });
});
