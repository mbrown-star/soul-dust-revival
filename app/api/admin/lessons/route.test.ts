import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { studies, products, users, lessons, contentBlocks, responses, lessonProgress } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import type { StudyWeekContent, StudyStation } from "@/lib/study/studyContent";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { POST, PATCH, DELETE } = await import("./route");
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
      .values({ email: `lessons-admin-${randomUUID()}@example.com`, role: "admin" })
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
    if (studyId) {
      const lessonIds = (await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, studyId))).map((l) => l.id);
      if (lessonIds.length) {
        const blockIds = (await db.select({ id: contentBlocks.id }).from(contentBlocks).where(inArray(contentBlocks.lessonId, lessonIds))).map((b) => b.id);
        if (blockIds.length) await db.delete(responses).where(inArray(responses.contentBlockId, blockIds));
        await db.delete(contentBlocks).where(inArray(contentBlocks.lessonId, lessonIds));
        await db.delete(lessonProgress).where(inArray(lessonProgress.lessonId, lessonIds));
      }
    }
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

  it("rejects a reorder that mixes studies or leaves a lesson out", async () => {
    await signInAsAdmin();
    const [a, b] = await db
      .insert(lessons)
      .values([
        { studyId, title: "A", orderIndex: 0 },
        { studyId, title: "B", orderIndex: 1 },
      ])
      .returning();
    const [otherStudy] = await db.insert(studies).values({ productId, title: "Other", slug: `other-${randomUUID()}`, published: false }).returning();
    const [foreign] = await db.insert(lessons).values({ studyId: otherStudy!.id, title: "Foreign", orderIndex: 0 }).returning();

    try {
      const mixed = await PATCH(patchRequest({ reorder: [{ id: a!.id, orderIndex: 0 }, { id: foreign!.id, orderIndex: 1 }] }));
      expect(mixed.status).toBe(400);
      const partial = await PATCH(patchRequest({ reorder: [{ id: b!.id, orderIndex: 0 }] }));
      expect(partial.status).toBe(409);
      const [foreignAfter] = await db.select().from(lessons).where(eq(lessons.id, foreign!.id));
      expect(foreignAfter!.orderIndex).toBe(0);
    } finally {
      await db.delete(lessons).where(eq(lessons.id, foreign!.id));
      await db.delete(studies).where(eq(studies.id, otherStudy!.id));
    }
  });

  describe("deleting a lesson", () => {
    function deleteRequest(id: string) {
      return new NextRequest("https://example.com/api/admin/lessons", {
        method: "DELETE",
        body: JSON.stringify({ id }),
        headers: { "Content-Type": "application/json" },
      });
    }

    it("is admin-only", async () => {
      await signInAsAdmin();
      vi.mocked(requireAdmin).mockResolvedValue(null);
      expect((await DELETE(deleteRequest(randomUUID()))).status).toBe(403);
    });

    it("deletes a draft with its blocks and the admin's own preview data, and re-numbers the rest", async () => {
      await signInAsAdmin();
      const [a, draft, c] = await db
        .insert(lessons)
        .values([
          { studyId, title: "A", orderIndex: 0, published: true },
          { studyId, title: "Draft", orderIndex: 1 },
          { studyId, title: "C", orderIndex: 2, published: true },
        ])
        .returning();
      const [question] = await db.insert(contentBlocks).values({ lessonId: draft!.id, type: "question", orderIndex: 0 }).returning();
      await db.insert(responses).values({ userId: adminUserId, contentBlockId: question!.id, answerText: "preview" });
      await db.insert(lessonProgress).values({ userId: adminUserId, lessonId: draft!.id, status: "in_progress" });

      const res = await DELETE(deleteRequest(draft!.id));
      expect(res.status).toBe(200);
      expect(await db.$count(lessons, eq(lessons.id, draft!.id))).toBe(0);
      expect(await db.$count(contentBlocks, eq(contentBlocks.lessonId, draft!.id))).toBe(0);
      const rest = await db.select().from(lessons).where(eq(lessons.studyId, studyId)).orderBy(asc(lessons.orderIndex));
      expect(rest.map((l) => [l.id, l.orderIndex])).toEqual([
        [a!.id, 0],
        [c!.id, 1],
      ]);
    });

    it("refuses a published lesson", async () => {
      await signInAsAdmin();
      const [lesson] = await db.insert(lessons).values({ studyId, title: "Live", orderIndex: 0, published: true }).returning();
      const res = await DELETE(deleteRequest(lesson!.id));
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe("published");
    });

    it("refuses a draft that a reader has answered or made progress on", async () => {
      await signInAsAdmin();
      const [reader] = await db.insert(users).values({ email: `lessons-reader-${randomUUID()}@example.com`, role: "user" }).returning();
      const [lesson] = await db.insert(lessons).values({ studyId, title: "Was live", orderIndex: 0 }).returning();
      try {
        await db.insert(lessonProgress).values({ userId: reader!.id, lessonId: lesson!.id, status: "completed" });
        const res = await DELETE(deleteRequest(lesson!.id));
        expect(res.status).toBe(409);
        expect(((await res.json()) as { error: string }).error).toBe("has_reader_data");
        expect(await db.$count(lessons, eq(lessons.id, lesson!.id))).toBe(1);
      } finally {
        await db.delete(lessonProgress).where(eq(lessonProgress.userId, reader!.id));
        await db.delete(users).where(eq(users.id, reader!.id));
      }
    });
  });

  describe("structured study content", () => {
    function station(overrides: Partial<StudyStation> = {}): StudyStation {
      return {
        ref: "1:2",
        verse: "Grace to you",
        question: "What is grace?",
        questionBlockId: "",
        greek: "",
        translit: "",
        gloss: "",
        xref: "",
        body: [],
        live: "",
        verseNums: [],
        anchor: null,
        ...overrides,
      };
    }

    function week(overrides: Partial<StudyWeekContent> = {}): StudyWeekContent {
      return {
        subtitle: "",
        keyVerse: "Key",
        keyRef: "Col 1:6",
        study: { sections: [], parts: [] },
        passageRef: "Col 1:1-14",
        passage: [],
        stationsLabel: "Work the Word",
        stationsIntro: "",
        stations: [],
        lifeTitle: "",
        lifeIntro: "",
        practices: [],
        prayerLead: "",
        prayerBeats: [],
        prayerClose: "",
        bottomLine: [],
        benediction: [],
        closingVerse: "",
        closingRef: "",
        carry: "",
        ...overrides,
      };
    }

    async function makeLesson() {
      const [lesson] = await db.insert(lessons).values({ studyId, title: "Week 1", orderIndex: 0 }).returning();
      return lesson!.id;
    }

    async function questionBlocks(lessonId: string) {
      return db.select().from(contentBlocks).where(eq(contentBlocks.lessonId, lessonId)).orderBy(asc(contentBlocks.orderIndex));
    }

    it("creates a question block per new station and renumbers practices from list order", async () => {
      await signInAsAdmin();
      const lessonId = await makeLesson();
      const res = await PATCH(
        patchRequest({
          id: lessonId,
          studyContent: week({
            stations: [station(), station({ ref: "1:4", question: "Second?" })],
            practices: [
              { n: 7, title: "B", body: "" },
              { n: 2, title: "A", body: "" },
            ],
          }),
        })
      );
      expect(res.status).toBe(200);
      const saved = ((await res.json()) as { studyContent: StudyWeekContent }).studyContent;
      expect(saved.practices.map((p) => p.n)).toEqual([1, 2]);
      const blocks = await questionBlocks(lessonId);
      expect(blocks.map((b) => b.questionPrompt)).toEqual(["What is grace?", "Second?"]);
      expect(saved.stations.map((s) => s.questionBlockId)).toEqual(blocks.map((b) => b.id));
    });

    it("answers 400 and writes nothing when a station claims another lesson's question block", async () => {
      await signInAsAdmin();
      const lessonId = await makeLesson();
      const otherLessonId = await makeLesson();
      const [foreignBlock] = await db
        .insert(contentBlocks)
        .values({ lessonId: otherLessonId, type: "question", orderIndex: 0, questionPrompt: "Untouched" })
        .returning();

      const res = await PATCH(
        patchRequest({
          id: lessonId,
          studyContent: week({ stations: [station({ question: "New one" }), station({ questionBlockId: foreignBlock!.id, question: "Hijack" })] }),
        })
      );
      expect(res.status).toBe(400);

      // Rolled back: no block created for the first (new) station, nothing saved on the lesson.
      expect(await questionBlocks(lessonId)).toHaveLength(0);
      const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
      expect(lesson!.studyContent).toBeNull();
      const [untouched] = await db.select().from(contentBlocks).where(eq(contentBlocks.id, foreignBlock!.id));
      expect(untouched!.questionPrompt).toBe("Untouched");
    });

    it("creates the answer block under a builder-assigned id for a new station", async () => {
      await signInAsAdmin();
      const lessonId = await makeLesson();
      const id = randomUUID();
      const res = await PATCH(patchRequest({ id: lessonId, studyContent: week({ stations: [station({ questionBlockId: id })] }) }));
      expect(res.status).toBe(200);
      const saved = ((await res.json()) as { studyContent: StudyWeekContent }).studyContent;
      expect(saved.stations[0]!.questionBlockId).toBe(id);
      const blocks = await questionBlocks(lessonId);
      expect(blocks.map((b) => [b.id, b.type])).toEqual([[id, "question"]]);

      // Saving the same week again updates that block rather than adding another.
      const again = await PATCH(patchRequest({ id: lessonId, studyContent: week({ stations: [station({ questionBlockId: id, question: "Edited" })] }) }));
      expect(again.status).toBe(200);
      expect((await questionBlocks(lessonId)).map((b) => b.questionPrompt)).toEqual(["Edited"]);
    });

    it("rejects two stations sharing one id, and an id that points at a non-question block", async () => {
      await signInAsAdmin();
      const lessonId = await makeLesson();
      const id = randomUUID();
      const dup = await PATCH(
        patchRequest({ id: lessonId, studyContent: week({ stations: [station({ questionBlockId: id }), station({ questionBlockId: id })] }) })
      );
      expect(dup.status).toBe(400);

      const [textBlock] = await db.insert(contentBlocks).values({ lessonId, type: "text", orderIndex: 0, body: "<p>x</p>" }).returning();
      const wrongType = await PATCH(patchRequest({ id: lessonId, studyContent: week({ stations: [station({ questionBlockId: textBlock!.id })] }) }));
      expect(wrongType.status).toBe(400);
      const [unchanged] = await db.select().from(contentBlocks).where(eq(contentBlocks.id, textBlock!.id));
      expect(unchanged!.questionPrompt).toBeNull();
    });

    it("saves media placed in a week, sanitizing callout HTML", async () => {
      await signInAsAdmin();
      const lessonId = await makeLesson();
      const mediaId = randomUUID();
      const res = await PATCH(
        patchRequest({
          id: lessonId,
          studyContent: week({
            stations: [station({ questionBlockId: randomUUID(), media: [{ id: mediaId, type: "callout", body: "<p>ok</p><script>alert(1)</script>" }] })],
            tabMedia: { lift: [{ id: randomUUID(), type: "image", imageUrl: "https://example.com/a.png", imageAlt: "A" }] },
          }),
        })
      );
      expect(res.status).toBe(200);
      const [lesson] = await db.select().from(lessons).where(eq(lessons.id, lessonId));
      expect(lesson!.studyContent!.stations[0]!.media![0]!.body).toBe("<p>ok</p>");
      expect(lesson!.studyContent!.tabMedia!.lift![0]!.imageAlt).toBe("A");
    });

    it("deletes a removed station's question block, but keeps one readers have answered", async () => {
      await signInAsAdmin();
      const lessonId = await makeLesson();
      const first = await PATCH(patchRequest({ id: lessonId, studyContent: week({ stations: [station({ question: "Keep" }), station({ question: "Drop" }), station({ question: "Answered" })] }) }));
      const saved = ((await first.json()) as { studyContent: StudyWeekContent }).studyContent;
      const [keep, drop, answered] = saved.stations;
      await db.insert(responses).values({ userId: adminUserId, contentBlockId: answered!.questionBlockId, answerText: "Yes" });

      const res = await PATCH(patchRequest({ id: lessonId, studyContent: week({ stations: [keep!] }) }));
      expect(res.status).toBe(200);

      const remaining = (await questionBlocks(lessonId)).map((b) => b.id);
      expect(remaining).toContain(keep!.questionBlockId);
      expect(remaining).toContain(answered!.questionBlockId);
      expect(remaining).not.toContain(drop!.questionBlockId);
    });
  });
});
