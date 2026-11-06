import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { studies, products, users, lessons, lessonProgress, entitlements } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
// revalidatePath needs a real Next.js request context (a "static generation
// store") that vitest doesn't set up -- mocked the same way any other
// genuine external dependency is in this project's tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST } = await import("./route");
const { getSession } = await import("@/lib/auth/session");
const { revalidatePath } = await import("next/cache");

function progressRequest(body: unknown) {
  return new NextRequest("https://example.com/api/progress", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/progress", () => {
  let userId: string;
  let productId: string;
  let studyId: string;
  let lessonId: string;
  let db: Db;

  async function setUp() {
    db = await getDb();
    const [user] = await db.insert(users).values({ email: `user-${randomUUID()}@example.com` }).returning();
    userId = user!.id;
    vi.mocked(getSession).mockResolvedValue({ userId, email: user!.email });

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
    await db.insert(entitlements).values({ userId, productId, source: "purchase" });

    const [study] = await db
      .insert(studies)
      .values({ productId, title: "A Study", slug: `a-study-${randomUUID()}`, published: true })
      .returning();
    studyId = study!.id;

    const [lesson] = await db
      .insert(lessons)
      .values({ studyId, title: "Lesson 1", orderIndex: 0, published: true })
      .returning();
    lessonId = lesson!.id;
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

  it("rejects an unauthenticated request", async () => {
    await setUp();
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(progressRequest({ lessonId, status: "in_progress" }));
    expect(res.status).toBe(401);
  });

  it("creates a progress row on first write", async () => {
    await setUp();

    const res = await POST(progressRequest({ lessonId, status: "in_progress" }));
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("in_progress");
  });

  it("invalidates the study's lesson list and My Library, so a status change shows up without a hard refresh", async () => {
    await setUp();
    vi.mocked(revalidatePath).mockClear();

    const res = await POST(progressRequest({ lessonId, status: "completed" }));
    expect(res.status).toBe(200);

    const [study] = await db.select().from(studies).where(eq(studies.id, studyId));
    expect(revalidatePath).toHaveBeenCalledWith(`/studies/${study!.slug}`);
    expect(revalidatePath).toHaveBeenCalledWith("/library");
  });

  it("updates the existing row in place rather than creating a second one", async () => {
    await setUp();

    await POST(progressRequest({ lessonId, status: "in_progress" }));
    const res = await POST(progressRequest({ lessonId, status: "completed" }));
    expect(res.status).toBe(200);

    const rows = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("completed");
    expect(rows[0]!.completedAt).not.toBeNull();
  });

  it("never creates duplicate rows when two writes for the same lesson race (the \"mark in progress\" ping vs. the \"mark complete\" click)", async () => {
    await setUp();

    // Fired concurrently, matching the real race: the page-load ping and a
    // near-immediate "mark complete" click, with no guaranteed ordering.
    const [resA, resB] = await Promise.all([
      POST(progressRequest({ lessonId, status: "in_progress" })),
      POST(progressRequest({ lessonId, status: "completed" })),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const rows = await db
      .select()
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, lessonId)));
    // Exactly one row, whichever write landed last -- never two.
    expect(rows).toHaveLength(1);
  });

  it("rejects a lesson from a study the user has no entitlement to", async () => {
    await setUp();
    await db.delete(entitlements).where(eq(entitlements.productId, productId));

    const res = await POST(progressRequest({ lessonId, status: "completed" }));
    expect(res.status).toBe(403);
  });
});
