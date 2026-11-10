import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { studies, products, users, lessons, lessonProgress, responses, contentBlocks, entitlements } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
// revalidatePath needs a real Next.js request context (a "static generation
// store") that vitest doesn't set up -- mocked the same way any other
// genuine external dependency is in this project's tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createSampleStudyFixture } from "@/lib/testing/sampleStudyFixture";

const { POST } = await import("./route");
const { getSession } = await import("@/lib/auth/session");

function resetRequest(studyId: string) {
  return new NextRequest("https://example.com/api/progress/reset", {
    method: "POST",
    body: JSON.stringify({ studyId }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/progress/reset", () => {
  let userId: string;
  let productId: string;
  let studyId: string;
  let lessonIds: string[] = [];
  let db: Db;

  async function setUp(grantEntitlement: boolean) {
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

    if (grantEntitlement) {
      await db.insert(entitlements).values({ userId, productId, source: "purchase" });
    }

    const [study] = await db
      .insert(studies)
      .values({ productId, title: "A Study", slug: `a-study-${randomUUID()}`, published: true })
      .returning();
    studyId = study!.id;

    const inserted = await db
      .insert(lessons)
      .values([
        { studyId, title: "Lesson 1", orderIndex: 0, published: true },
        { studyId, title: "Lesson 2", orderIndex: 1, published: true },
      ])
      .returning();
    lessonIds = inserted.map((l) => l.id);

    await db.insert(lessonProgress).values(
      lessonIds.map((lessonId) => ({ userId, lessonId, status: "completed" as const, completedAt: new Date() }))
    );
  }

  afterEach(async () => {
    if (userId) await db.delete(responses).where(eq(responses.userId, userId));
    for (const lessonId of lessonIds) {
      await db.delete(contentBlocks).where(eq(contentBlocks.lessonId, lessonId));
      await db.delete(lessonProgress).where(eq(lessonProgress.lessonId, lessonId));
    }
    if (studyId) await db.delete(lessons).where(eq(lessons.studyId, studyId));
    if (studyId) await db.delete(studies).where(eq(studies.id, studyId));
    if (productId) await db.delete(entitlements).where(eq(entitlements.productId, productId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
    lessonIds = [];
    vi.mocked(getSession).mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    await setUp(true);
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(resetRequest(studyId));
    expect(res.status).toBe(401);
  });

  it("rejects a user without an entitlement to the study's product", async () => {
    await setUp(false);

    const res = await POST(resetRequest(studyId));
    expect(res.status).toBe(403);

    const remaining = await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, lessonIds[0]!));
    expect(remaining).toHaveLength(1); // untouched
  });

  it("clears this user's progress for every lesson in the study", async () => {
    await setUp(true);

    const res = await POST(resetRequest(studyId));
    expect(res.status).toBe(200);

    for (const lessonId of lessonIds) {
      const remaining = await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, lessonId));
      expect(remaining).toHaveLength(0);
    }
  });

  it("leaves a saved response (journal answer) in place, only clearing progress", async () => {
    await setUp(true);

    const [block] = await db
      .insert(contentBlocks)
      .values({ lessonId: lessonIds[0]!, orderIndex: 0, type: "question", questionPrompt: "A question" })
      .returning();
    await db.insert(responses).values({ userId, contentBlockId: block!.id, answerText: "My real answer" });

    const res = await POST(resetRequest(studyId));
    expect(res.status).toBe(200);

    const stillThere = await db.select().from(responses).where(eq(responses.contentBlockId, block!.id));
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]!.answerText).toBe("My real answer");
  });
});

describe("POST /api/progress/reset -- free-sample reader", () => {
  let fixture: Awaited<ReturnType<typeof createSampleStudyFixture>>;

  afterEach(async () => {
    await fixture?.cleanup();
    vi.mocked(getSession).mockReset();
  });

  it("restarts a sample reader's sample lessons", async () => {
    fixture = await createSampleStudyFixture();
    vi.mocked(getSession).mockResolvedValue(fixture.session);
    const db = await getDb();
    await db.insert(lessonProgress).values({ userId: fixture.userId, lessonId: fixture.sampleLessonId, status: "completed" });

    const res = await POST(resetRequest(fixture.studyId));

    expect(res.status).toBe(200);
    expect(await db.select().from(lessonProgress).where(eq(lessonProgress.lessonId, fixture.sampleLessonId))).toHaveLength(0);
  });

  it("refuses a reader who neither owns the study nor has a sample of it", async () => {
    fixture = await createSampleStudyFixture();
    vi.mocked(getSession).mockResolvedValue(fixture.session);
    const db = await getDb();
    await db.update(lessons).set({ isSample: false }).where(eq(lessons.id, fixture.sampleLessonId));

    expect((await POST(resetRequest(fixture.studyId))).status).toBe(403);
  });
});
