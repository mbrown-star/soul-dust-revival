import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contentBlocks, lessonProgress, lessons, products, responses, studies, users } from "@/lib/db/schema";

/**
 * Test-only: a published study with one free-sample lesson and one locked
 * lesson (each with a question block that also has a video), and a reader
 * who doesn't own the study. For the reader API routes' free-sample tests,
 * against the real local test database like the rest of the suite.
 */
export async function createSampleStudyFixture() {
  const db = await getDb();
  const [user] = await db.insert(users).values({ email: `sample-reader-${randomUUID()}@example.com` }).returning();
  const [product] = await db
    .insert(products)
    .values({ type: "study_access", format: "digital", title: "Sample Study", slug: `sample-${randomUUID()}`, priceCents: 2900 })
    .returning();
  const [study] = await db
    .insert(studies)
    .values({ productId: product!.id, title: "Sample Study", slug: `sample-study-${randomUUID()}`, published: true })
    .returning();
  const [sampleLesson, lockedLesson] = await db
    .insert(lessons)
    .values([
      { studyId: study!.id, orderIndex: 0, title: "Week 1: Open", published: true, isSample: true },
      { studyId: study!.id, orderIndex: 1, title: "Week 2: Locked", published: true, isSample: false },
    ])
    .returning();
  const [sampleBlock, lockedBlock] = await db
    .insert(contentBlocks)
    .values([
      { lessonId: sampleLesson!.id, orderIndex: 0, type: "question", questionPrompt: "Q?", mediaId: "stream-sample" },
      { lessonId: lockedLesson!.id, orderIndex: 0, type: "question", questionPrompt: "Q?", mediaId: "stream-locked" },
    ])
    .returning();

  const lessonIds = [sampleLesson!.id, lockedLesson!.id];
  return {
    userId: user!.id,
    session: { userId: user!.id, email: user!.email },
    studyId: study!.id,
    sampleLessonId: sampleLesson!.id,
    lockedLessonId: lockedLesson!.id,
    sampleBlockId: sampleBlock!.id,
    lockedBlockId: lockedBlock!.id,
    async cleanup() {
      await db.delete(responses).where(inArray(responses.contentBlockId, [sampleBlock!.id, lockedBlock!.id]));
      await db.delete(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds));
      await db.delete(contentBlocks).where(inArray(contentBlocks.lessonId, lessonIds));
      await db.delete(lessons).where(eq(lessons.studyId, study!.id));
      await db.delete(studies).where(eq(studies.id, study!.id));
      await db.delete(products).where(eq(products.id, product!.id));
      await db.delete(users).where(eq(users.id, user!.id));
    },
  };
}
