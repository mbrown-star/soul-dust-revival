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

const sendMock = vi.fn().mockResolvedValue({});
vi.mock("@/lib/r2/client", () => ({
  r2: { send: sendMock },
  R2_BUCKET: "test-bucket",
  r2PublicUrl: (key: string) => `https://assets.example.com/${key}`,
  IMMUTABLE_CACHE_CONTROL: "public, max-age=31536000, immutable",
}));

const parsePdfToTextMock = vi.fn();
vi.mock("@/lib/import/parsePdf", () => ({ parsePdfToText: parsePdfToTextMock }));

const { POST } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

const DEVOTIONAL_TEXT = ["Day 1", "A new key thought for today.", "", "Day 2", "A new day's reflection."].join("\n");

function reimportRequest(studyId: string, file: File) {
  const form = new FormData();
  form.set("studyId", studyId);
  form.set("file", file);
  return new NextRequest("https://example.com/api/admin/studies/reimport", { method: "POST", body: form });
}

describe("POST /api/admin/studies/reimport", () => {
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
    parsePdfToTextMock.mockReset();
    sendMock.mockClear();
  });

  it("rejects when not an admin", async () => {
    await signInAsAdmin();
    vi.mocked(requireAdmin).mockResolvedValue(null);

    const res = await POST(
      reimportRequest(randomUUID(), new File([Buffer.from("x")], "doc.pdf", { type: "application/pdf" }))
    );
    expect(res.status).toBe(403);
  });

  it("replaces an existing study's lessons and content blocks, and resets it to unpublished", async () => {
    await signInAsAdmin();
    parsePdfToTextMock.mockResolvedValue(DEVOTIONAL_TEXT);

    const [study] = await db
      .insert(studies)
      .values({
        productId,
        title: "Old Title",
        slug: `reimport-${randomUUID()}`,
        kind: "devotional",
        published: true,
        sourceFileUrl: "https://assets.example.com/study-sources/old.pdf",
        sourceFileName: "old.pdf",
      })
      .returning();

    const [oldLesson] = await db
      .insert(lessons)
      .values({ studyId: study!.id, title: "Old Lesson", orderIndex: 0, published: true })
      .returning();
    const [oldBlock] = await db
      .insert(contentBlocks)
      .values({ lessonId: oldLesson!.id, orderIndex: 0, type: "text", body: "<p>old</p>" })
      .returning();
    await db.insert(lessonProgress).values({ userId: adminUserId, lessonId: oldLesson!.id, status: "completed" });
    await db.insert(responses).values({ userId: adminUserId, contentBlockId: oldBlock!.id, answerText: "old answer" });

    const res = await POST(
      reimportRequest(study!.id, new File([Buffer.from("x")], "new.pdf", { type: "application/pdf" }))
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { studyId: string; lessonCount: number };
    expect(json.studyId).toBe(study!.id);
    expect(json.lessonCount).toBe(2);

    const [updatedStudy] = await db.select().from(studies).where(eq(studies.id, study!.id));
    expect(updatedStudy!.published).toBe(false);
    expect(updatedStudy!.sourceFileName).toBe("new.pdf");
    // A fresh server-generated key, not the old stored source file's.
    expect(updatedStudy!.sourceFileUrl).toMatch(/^https:\/\/assets\.example\.com\/study-sources\/[0-9a-f-]+\.pdf$/);
    expect(updatedStudy!.sourceFileUrl).not.toBe("https://assets.example.com/study-sources/old.pdf");

    const newLessons = await db.select().from(lessons).where(eq(lessons.studyId, study!.id));
    expect(newLessons).toHaveLength(2);
    expect(newLessons.map((l) => l.title).sort()).toEqual(["Day 1", "Day 2"]);
    expect(newLessons.every((l) => !l.published)).toBe(true);

    // The old lesson and everything hanging off it (content block, progress,
    // saved answer) are gone -- not left as orphaned rows.
    const [oldLessonStillThere] = await db.select().from(lessons).where(eq(lessons.id, oldLesson!.id));
    expect(oldLessonStillThere).toBeUndefined();
    const [oldBlockStillThere] = await db.select().from(contentBlocks).where(eq(contentBlocks.id, oldBlock!.id));
    expect(oldBlockStillThere).toBeUndefined();
    const progressRows = await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, oldLesson!.id));
    expect(progressRows).toHaveLength(0);
    const responseRows = await db.select().from(responses).where(eq(responses.contentBlockId, oldBlock!.id));
    expect(responseRows).toHaveLength(0);

    const newLessonIds = newLessons.map((l) => l.id);
    for (const lessonId of newLessonIds) {
      await db.delete(contentBlocks).where(eq(contentBlocks.lessonId, lessonId));
    }
    await db.delete(lessons).where(eq(lessons.studyId, study!.id));
    await db.delete(studies).where(eq(studies.id, study!.id));
  });

  it("refuses to reimport a study whose product has order history", async () => {
    await signInAsAdmin();
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Sold Study", slug: `sold-reimport-${randomUUID()}`, published: false })
      .returning();
    const [order] = await db.insert(orders).values({ country: "US", status: "paid", totalCents: 2900 }).returning();
    await db.insert(orderItems).values({ orderId: order!.id, productId, quantity: 1 });

    try {
      const res = await POST(
        reimportRequest(study!.id, new File([Buffer.from("x")], "new.pdf", { type: "application/pdf" }))
      );
      expect(res.status).toBe(409);
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      await db.delete(orderItems).where(eq(orderItems.orderId, order!.id));
      await db.delete(orders).where(eq(orders.id, order!.id));
      await db.delete(studies).where(eq(studies.id, study!.id));
    }
  });

  it("refuses to reimport a study whose product has a granted entitlement", async () => {
    await signInAsAdmin();
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Granted Study", slug: `granted-reimport-${randomUUID()}`, published: false })
      .returning();
    await db.insert(entitlements).values({ userId: adminUserId, productId, source: "admin_grant" });

    try {
      const res = await POST(
        reimportRequest(study!.id, new File([Buffer.from("x")], "new.pdf", { type: "application/pdf" }))
      );
      expect(res.status).toBe(409);
      expect(sendMock).not.toHaveBeenCalled();
    } finally {
      await db.delete(entitlements).where(eq(entitlements.productId, productId));
      await db.delete(studies).where(eq(studies.id, study!.id));
    }
  });

  it("rejects an unsupported file type", async () => {
    await signInAsAdmin();
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "Txt Study", slug: `txt-reimport-${randomUUID()}`, published: false })
      .returning();

    try {
      const res = await POST(
        reimportRequest(study!.id, new File([Buffer.from("x")], "doc.txt", { type: "text/plain" }))
      );
      expect(res.status).toBe(400);
    } finally {
      await db.delete(studies).where(eq(studies.id, study!.id));
    }
  });

  it("returns 404 for a nonexistent study", async () => {
    await signInAsAdmin();
    const res = await POST(
      reimportRequest(randomUUID(), new File([Buffer.from("x")], "new.pdf", { type: "application/pdf" }))
    );
    expect(res.status).toBe(404);
  });
});
