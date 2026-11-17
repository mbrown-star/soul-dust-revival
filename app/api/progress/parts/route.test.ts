import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { entitlements, lessonProgress, lessons, products, studies, users } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST } = await import("./route");
const { getSession } = await import("@/lib/auth/session");

function partRequest(body: unknown) {
  return new NextRequest("https://example.com/api/progress/parts", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/progress/parts", () => {
  let db: Db;
  let userId: string;
  let productId: string;
  let studyId: string;
  let lessonId: string;

  async function setUp({ entitled = true } = {}) {
    db = await getDb();
    const [user] = await db.insert(users).values({ email: `user-${randomUUID()}@example.com` }).returning();
    userId = user!.id;
    vi.mocked(getSession).mockResolvedValue({ userId, email: user!.email });
    const [product] = await db
      .insert(products)
      .values({ type: "study_access", format: "digital", title: "Study", slug: `parts-${randomUUID()}`, priceCents: 2900 })
      .returning();
    productId = product!.id;
    if (entitled) await db.insert(entitlements).values({ userId, productId, source: "purchase" });
    const [study] = await db
      .insert(studies)
      .values({ productId, title: "A Study", slug: `parts-study-${randomUUID()}`, published: true })
      .returning();
    studyId = study!.id;
    const [lesson] = await db
      .insert(lessons)
      .values({ studyId, title: "Week 1: Test", orderIndex: 0, published: true })
      .returning();
    lessonId = lesson!.id;
  }

  async function row() {
    const rows = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)));
    return rows;
  }

  afterEach(async () => {
    if (lessonId) await db.delete(lessonProgress).where(eq(lessonProgress.lessonId, lessonId));
    if (studyId) await db.delete(lessons).where(eq(lessons.studyId, studyId));
    if (studyId) await db.delete(studies).where(eq(studies.id, studyId));
    if (productId) await db.delete(entitlements).where(eq(entitlements.productId, productId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
    vi.mocked(getSession).mockReset();
  });

  it("refuses a signed-out reader", async () => {
    await setUp();
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(partRequest({ lessonId, part: "study", done: true }))).status).toBe(401);
  });

  it("refuses a reader without access to the study", async () => {
    await setUp({ entitled: false });
    expect((await POST(partRequest({ lessonId, part: "study", done: true }))).status).toBe(403);
    expect(await row()).toHaveLength(0);
  });

  it("refuses Lift Up and unknown fields (Lift Up is the week's completion)", async () => {
    await setUp();
    expect((await POST(partRequest({ lessonId, part: "lift", done: true }))).status).toBe(400);
    expect((await POST(partRequest({ lessonId, part: "study", done: true, extra: 1 }))).status).toBe(400);
  });

  it("saves a part, starts the week, and keeps each part once", async () => {
    await setUp();
    const res = await POST(partRequest({ lessonId, part: "work", done: true }));
    expect(res.status).toBe(200);
    await POST(partRequest({ lessonId, part: "study", done: true }));
    const again = await POST(partRequest({ lessonId, part: "study", done: true }));
    expect(await again.json()).toEqual({ ok: true, partsDone: ["study", "work"] });
    const [saved] = await row();
    expect(saved!.status).toBe("in_progress");
    expect([...saved!.partsDone].sort()).toEqual(["study", "work"]);
  });

  it("never changes a completed week's status", async () => {
    await setUp();
    await db.insert(lessonProgress).values({ userId, lessonId, status: "completed", completedAt: new Date() });
    await POST(partRequest({ lessonId, part: "live", done: true }));
    await POST(partRequest({ lessonId, part: "live", done: false }));
    const [saved] = await row();
    expect(saved!.status).toBe("completed");
    expect(saved!.partsDone).toEqual([]);
  });

  it("un-finishing a part removes only that part and creates no row when there is none", async () => {
    await setUp();
    expect((await POST(partRequest({ lessonId, part: "study", done: false }))).status).toBe(200);
    expect(await row()).toHaveLength(0);
    await POST(partRequest({ lessonId, part: "study", done: true }));
    await POST(partRequest({ lessonId, part: "passage", done: true }));
    await POST(partRequest({ lessonId, part: "study", done: false }));
    const [saved] = await row();
    expect(saved!.partsDone).toEqual(["passage"]);
  });

  it("two parts saved at the same moment both land", async () => {
    await setUp();
    await Promise.all([
      POST(partRequest({ lessonId, part: "study", done: true })),
      POST(partRequest({ lessonId, part: "live", done: true })),
    ]);
    const rows = await row();
    expect(rows).toHaveLength(1);
    expect([...rows[0]!.partsDone].sort()).toEqual(["live", "study"]);
  });
});
