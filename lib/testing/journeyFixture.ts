import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  bundleItems,
  contentBlocks,
  entitlements,
  journeyEnrollments,
  journeys,
  lessonProgress,
  lessons,
  products,
  responses,
  studies,
  users,
} from "@/lib/db/schema";

/**
 * Test-only: a published two-Part Journey (5 stops: Part One's threshold,
 * Week 1, Week 2, Part Two's threshold, Week 3, each week with a question
 * block), a reader who owns both Parts but hasn't begun, and an admin. For
 * the Journey's access and route tests, against the real local test
 * database like the rest of the suite.
 */
export async function createJourneyFixture() {
  const db = await getDb();
  const tag = randomUUID().slice(0, 8);
  const [reader] = await db.insert(users).values({ email: `journey-reader-${tag}@example.com` }).returning();
  const [admin] = await db.insert(users).values({ email: `journey-admin-${tag}@example.com`, role: "admin" }).returning();

  const [bundle, partOne, partTwo] = await db
    .insert(products)
    .values([
      { type: "bundle", format: "digital", title: "The Journey", slug: `journey-${tag}`, priceCents: 8000 },
      { type: "book", format: "physical", title: "Part One", slug: `part-one-${tag}`, priceCents: 2500 },
      { type: "book", format: "physical", title: "Part Two", slug: `part-two-${tag}`, priceCents: 2500 },
    ])
    .returning();
  await db.insert(bundleItems).values([
    { bundleProductId: bundle!.id, componentProductId: partOne!.id, orderIndex: 0 },
    { bundleProductId: bundle!.id, componentProductId: partTwo!.id, orderIndex: 1 },
  ]);
  const [studyOne, studyTwo] = await db
    .insert(studies)
    .values([
      { productId: partOne!.id, title: "Soul Dust Revival: Part One — Out of the Dust", slug: `p1-${tag}`, kind: "study", published: true },
      { productId: partTwo!.id, title: "Soul Dust Revival: Part Two — Formed and Sent", slug: `p2-${tag}`, kind: "study", published: true },
    ])
    .returning();
  const lessonRows = await db
    .insert(lessons)
    .values([
      { studyId: studyOne!.id, orderIndex: 0, title: "Introduction", published: true },
      { studyId: studyOne!.id, orderIndex: 1, title: "Week 1: The Dust", published: true },
      { studyId: studyOne!.id, orderIndex: 2, title: "Week 2: The Crack", published: true },
      { studyId: studyTwo!.id, orderIndex: 0, title: "Introduction", published: true },
      { studyId: studyTwo!.id, orderIndex: 1, title: "Week 3: Formed", published: true },
    ])
    .returning();
  const stopIds = lessonRows.map((l) => l.id);
  const questionBlocks = await db
    .insert(contentBlocks)
    .values(
      [1, 2, 4].map((i) => ({ lessonId: stopIds[i]!, orderIndex: 0, type: "question" as const, questionPrompt: `Question for stop ${i}?` }))
    )
    .returning();
  const [journey] = await db
    .insert(journeys)
    .values({ bundleProductId: bundle!.id, title: "The Journey", slug: `the-journey-${tag}`, published: true })
    .returning();
  await db.insert(entitlements).values([
    { userId: reader!.id, productId: partOne!.id, source: "purchase" },
    { userId: reader!.id, productId: partTwo!.id, source: "purchase" },
  ]);

  const userIds = [reader!.id, admin!.id];
  return {
    journey: journey!,
    reader: { userId: reader!.id, email: reader!.email },
    admin: { userId: admin!.id, email: admin!.email },
    studyOne: studyOne!,
    studyTwo: studyTwo!,
    stopIds,
    lessons: lessonRows,
    questionBlockIds: questionBlocks.map((b) => b.id),
    productIds: { bundle: bundle!.id, partOne: partOne!.id, partTwo: partTwo!.id },
    /** Begin the Journey for the reader, as if on `openedThrough`/`nextOpensOn`. */
    async enroll(rhythm: { weekday: number; openedThrough: number; nextOpensOn: string }, userId = reader!.id) {
      await db.insert(journeyEnrollments).values({ userId, journeyId: journey!.id, timeZone: "UTC", ...rhythm });
    },
    async complete(stopIndex: number, userId = reader!.id) {
      await db
        .insert(lessonProgress)
        .values({ userId, lessonId: stopIds[stopIndex]!, status: "completed", completedAt: new Date() })
        .onConflictDoUpdate({ target: [lessonProgress.userId, lessonProgress.lessonId], set: { status: "completed" } });
    },
    async cleanup() {
      await db.delete(responses).where(inArray(responses.contentBlockId, questionBlocks.map((b) => b.id)));
      await db.delete(lessonProgress).where(inArray(lessonProgress.lessonId, stopIds));
      await db.delete(contentBlocks).where(inArray(contentBlocks.lessonId, stopIds));
      await db.delete(lessons).where(inArray(lessons.id, stopIds));
      await db.delete(studies).where(inArray(studies.id, [studyOne!.id, studyTwo!.id]));
      await db.delete(journeyEnrollments).where(eq(journeyEnrollments.journeyId, journey!.id));
      await db.delete(journeys).where(eq(journeys.id, journey!.id));
      await db.delete(entitlements).where(inArray(entitlements.userId, userIds));
      await db.delete(bundleItems).where(eq(bundleItems.bundleProductId, bundle!.id));
      await db.delete(products).where(inArray(products.id, [bundle!.id, partOne!.id, partTwo!.id]));
      await db.delete(users).where(inArray(users.id, userIds));
    },
  };
}
