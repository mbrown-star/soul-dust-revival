import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { contentBlocks, lessons, products, responses, studies, users } from "@/lib/db/schema";
import { applyWordStudyRepair, planWordStudyRepairs } from "./repairWordStudyCallouts";

// Real local test database, like the rest of the suite.
describe("repairing word-study callouts", () => {
  let db: Db;
  let tag: string;
  let ids: { product: string; study: string; lesson: string; user: string; question: string; callout: string; after: string };

  beforeEach(async () => {
    db = await getDb();
    tag = `repair-${randomUUID().slice(0, 8)}`;
    const [user] = await db.insert(users).values({ email: `${tag}@example.com` }).returning();
    const [product] = await db.insert(products).values({ type: "book", format: "physical", title: tag, slug: tag, priceCents: 100 }).returning();
    const [study] = await db.insert(studies).values({ productId: product!.id, title: tag, slug: tag, kind: "study" }).returning();
    const [lesson] = await db.insert(lessons).values({ studyId: study!.id, orderIndex: 1, title: "Week 1: Test" }).returning();
    const [question, callout, after] = await db
      .insert(contentBlocks)
      .values([
        { lessonId: lesson!.id, orderIndex: 0, type: "question", questionPrompt: "Q?" },
        {
          lessonId: lesson!.id,
          orderIndex: 1,
          type: "callout",
          calloutTitle: "χάρις",
          body: "<p>Study.</p>\n<p>LIVE IT: Do it.</p>\n<p><strong>LIFEAPPLICATION · WEEK 1</strong></p>\n<p>Apply.</p>",
        },
        { lessonId: lesson!.id, orderIndex: 2, type: "text", body: "<p>After.</p>" },
      ])
      .returning();
    await db.insert(responses).values({ userId: user!.id, contentBlockId: question!.id, answerText: "Kept." });
    ids = { product: product!.id, study: study!.id, lesson: lesson!.id, user: user!.id, question: question!.id, callout: callout!.id, after: after!.id };
  });

  afterEach(async () => {
    await db.delete(responses).where(eq(responses.userId, ids.user));
    await db.delete(contentBlocks).where(eq(contentBlocks.lessonId, ids.lesson));
    await db.delete(lessons).where(eq(lessons.id, ids.lesson));
    await db.delete(studies).where(eq(studies.id, ids.study));
    await db.delete(products).where(eq(products.id, ids.product));
    await db.delete(users).where(inArray(users.id, [ids.user]));
  });

  it("moves the Life Application into a new text block right after the callout, keeping every id and answer", async () => {
    const plan = await planWordStudyRepairs(db, tag);
    expect(plan).toHaveLength(1);
    expect(await applyWordStudyRepair(db, plan[0]!)).toBe(true);

    const blocks = await db.select().from(contentBlocks).where(eq(contentBlocks.lessonId, ids.lesson)).orderBy(asc(contentBlocks.orderIndex));
    expect(blocks.map((b) => [b.orderIndex, b.type])).toEqual([
      [0, "question"],
      [1, "callout"],
      [2, "text"],
      [3, "text"],
    ]);
    expect(blocks[0]!.id).toBe(ids.question);
    expect(blocks[1]!.id).toBe(ids.callout);
    expect(blocks[1]!.body).toBe("<p>Study.</p>\n<p>LIVE IT: Do it.</p>");
    expect(blocks[1]!.calloutTitle).toBe("χάρις");
    expect(blocks[2]!.body).toBe("<p><strong>LIFEAPPLICATION · WEEK 1</strong></p>\n<p>Apply.</p>");
    expect(blocks[3]!.id).toBe(ids.after);
    expect(await db.select().from(responses).where(eq(responses.contentBlockId, ids.question))).toHaveLength(1);
  });

  it("does nothing the second time", async () => {
    const [repair] = await planWordStudyRepairs(db, tag);
    await applyWordStudyRepair(db, repair!);
    expect(await applyWordStudyRepair(db, repair!)).toBe(false);
    expect(await planWordStudyRepairs(db, tag)).toHaveLength(0);
  });

  it("skips a lesson with a published snapshot", async () => {
    await db.update(lessons).set({ publishedContent: { blocks: [], studyContent: null, publishedAt: new Date().toISOString() } }).where(eq(lessons.id, ids.lesson));
    const [repair] = await planWordStudyRepairs(db, tag);
    expect(repair!.skipped).toBe("has a published snapshot");
    expect(await applyWordStudyRepair(db, repair!)).toBe(false);
  });
});
