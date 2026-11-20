import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { contentBlocks, lessons, products, studies } from "@/lib/db/schema";
import { createSampleStudyFixture } from "@/lib/testing/sampleStudyFixture";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { formatProjectContext, gatherProjectContext, lessonExcerpt, PROMOTION_RULES } from "./projectContext";

describe("formatProjectContext", () => {
  it("labels each sample by kind and lists its free lessons and excerpts", () => {
    const text = formatProjectContext(
      [
        {
          kind: "study",
          title: "Colossians",
          description: "<p>A study of Colossians.</p>",
          lessons: [
            { title: "Week 1", excerpt: "Christ is all." },
            { title: "Week 2", excerpt: "" },
          ],
        },
        { kind: "devotional", title: "Psalms", description: null, lessons: [{ title: "Day 1", excerpt: "Blessed is the man." }] },
      ],
      [{ title: "Why the dust", body: "<p>Hello <strong>men</strong>.</p>" }]
    );
    expect(text).toContain('- Study: "Colossians" (free sample: Week 1, Week 2) — A study of Colossians.');
    expect(text).toContain("  - Week 1: Christ is all.");
    expect(text).not.toContain("  - Week 2:");
    expect(text).toContain('- Devotional: "Psalms" (free sample: Day 1)');
    expect(text).toContain("- Why the dust: Hello men .");
    expect(text).toMatch(/store is closed/);
  });

  it("says so when nothing is published", () => {
    const text = formatProjectContext([], []);
    expect(text.match(/\(none published\)/g)).toHaveLength(2);
  });
});

describe("lessonExcerpt", () => {
  const week = {
    subtitle: "Rooted",
    keyVerse: "Walk in him",
    keyRef: "Col 2:6",
    study: { sections: [{ heading: "H", paras: ["<p>First para.</p>"] }], parts: [] },
  } as unknown as StudyWeekContent;

  it("prefers the published snapshot over the working copy", () => {
    const published = {
      blocks: [{ id: "b", type: "text", body: "<p>Published words</p>" }],
      studyContent: null,
      publishedAt: "2026-11-20T00:00:00Z",
    } as never;
    expect(lessonExcerpt(published, week, "<p>Draft words</p>")).toBe("Published words");
  });

  it("summarizes a structured study week", () => {
    expect(lessonExcerpt(null, week, null)).toBe('Rooted — "Walk in him" (Col 2:6) — First para.');
  });

  it("falls back to the working text block, capped", () => {
    expect(lessonExcerpt(null, null, `<p>${"a".repeat(500)}</p>`)).toHaveLength(300);
    expect(lessonExcerpt(null, null, null)).toBe("");
  });
});

describe("PROMOTION_RULES", () => {
  it("forbids promoting anything the context doesn't list", () => {
    expect(PROMOTION_RULES).toMatch(/never name, describe or invite readers to any other book/);
  });
});

describe("gatherProjectContext (real DB)", () => {
  let fixture: Awaited<ReturnType<typeof createSampleStudyFixture>>;
  const bookTitle = `Unlaunched Book ${randomUUID()}`;
  let bookProductId: string;
  let bookStudyId: string;

  beforeAll(async () => {
    fixture = await createSampleStudyFixture();
    const db = await getDb();
    const [product] = await db
      .insert(products)
      .values({ type: "study_access", format: "digital", title: bookTitle, slug: `book-${randomUUID()}`, priceCents: 1999 })
      .returning();
    bookProductId = product!.id;
    const [study] = await db
      .insert(studies)
      .values({ productId: bookProductId, title: bookTitle, slug: `book-${randomUUID()}`, kind: "book", published: true })
      .returning();
    bookStudyId = study!.id;
    const [lesson] = await db
      .insert(lessons)
      .values({ studyId: bookStudyId, orderIndex: 0, title: "Chapter 1", published: true, isSample: false })
      .returning();
    await db.insert(contentBlocks).values({ lessonId: lesson!.id, orderIndex: 0, type: "text", body: "<p>Book words</p>" });
  });

  afterAll(async () => {
    const db = await getDb();
    const bookLessons = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, bookStudyId));
    for (const l of bookLessons) await db.delete(contentBlocks).where(eq(contentBlocks.lessonId, l.id));
    await db.delete(lessons).where(eq(lessons.studyId, bookStudyId));
    await db.delete(studies).where(eq(studies.id, bookStudyId));
    await db.delete(products).where(eq(products.id, bookProductId));
    await fixture.cleanup();
  });

  it("includes a study's free-sample lessons and leaves out a published study with no sample", async () => {
    const text = await gatherProjectContext();
    expect(text).toContain('"Sample Study" (free sample: Week 1: Open)');
    expect(text).not.toContain("Week 2: Locked");
    expect(text).not.toContain(bookTitle);
    expect(text).not.toContain("Book words");
  });
});
