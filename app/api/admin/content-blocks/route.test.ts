import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { contentBlocks, lessons, products, responses, studies, users } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import type { StudyWeekContent } from "@/lib/study/studyContent";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { POST, PATCH, DELETE } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

function request(method: string, body: unknown) {
  return new NextRequest("https://example.com/api/admin/content-blocks", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("admin content-blocks route", () => {
  let db: Db;
  let adminUserId: string;
  let productId: string;
  let studyId: string;
  let lessonId: string;
  let otherLessonId: string;

  async function setup() {
    db = await getDb();
    const [admin] = await db.insert(users).values({ email: `blocks-admin-${randomUUID()}@example.com`, role: "admin" }).returning();
    adminUserId = admin!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminUserId, email: "admin@example.com", role: "admin" });

    const [product] = await db
      .insert(products)
      .values({ type: "study_access", format: "digital", title: "Blocks Product", slug: `blocks-${randomUUID()}`, priceCents: 100 })
      .returning();
    productId = product!.id;
    const [study] = await db.insert(studies).values({ productId, title: "Blocks Study", slug: `blocks-${randomUUID()}`, published: false }).returning();
    studyId = study!.id;
    const [lesson, other] = await db
      .insert(lessons)
      .values([
        { studyId, title: "Lesson A", orderIndex: 0 },
        { studyId, title: "Lesson B", orderIndex: 1 },
      ])
      .returning();
    lessonId = lesson!.id;
    otherLessonId = other!.id;
  }

  async function orderedTypes(id = lessonId) {
    const rows = await db
      .select({ type: contentBlocks.type, orderIndex: contentBlocks.orderIndex, body: contentBlocks.body })
      .from(contentBlocks)
      .where(eq(contentBlocks.lessonId, id))
      .orderBy(asc(contentBlocks.orderIndex));
    return rows;
  }

  async function create(body: Record<string, unknown>) {
    const res = await POST(request("POST", { lessonId, ...body }));
    return { res, json: (await res.json()) as { id: string; orderIndex: number; [k: string]: unknown } };
  }

  afterEach(async () => {
    if (lessonId) {
      const ids = [lessonId, otherLessonId];
      const blockIds = (await db.select({ id: contentBlocks.id }).from(contentBlocks).where(inArray(contentBlocks.lessonId, ids))).map((b) => b.id);
      if (blockIds.length) await db.delete(responses).where(inArray(responses.contentBlockId, blockIds));
      await db.delete(contentBlocks).where(inArray(contentBlocks.lessonId, ids));
      await db.delete(lessons).where(eq(lessons.studyId, studyId));
      await db.delete(studies).where(eq(studies.id, studyId));
      await db.delete(products).where(eq(products.id, productId));
      await db.delete(users).where(eq(users.id, adminUserId));
    }
    vi.mocked(requireAdmin).mockReset();
  });

  it("is admin-only", async () => {
    await setup();
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await POST(request("POST", { lessonId, type: "text" }))).status).toBe(403);
    expect((await PATCH(request("PATCH", { id: randomUUID(), body: "x" }))).status).toBe(403);
    expect((await DELETE(request("DELETE", { id: randomUUID() }))).status).toBe(403);
  });

  it("inserts a block at a position, shifting the ones after it", async () => {
    await setup();
    await create({ type: "text", initial: { body: "<p>first</p>" } });
    await create({ type: "text", initial: { body: "<p>last</p>" } });
    const { json } = await create({ type: "image", insertAt: 1 });
    expect(json.orderIndex).toBe(1);

    const rows = await orderedTypes();
    expect(rows.map((r) => [r.type, r.orderIndex])).toEqual([
      ["text", 0],
      ["image", 1],
      ["text", 2],
    ]);
  });

  it("creates a block with initial fields (duplicate / undo), sanitizing rich text", async () => {
    await setup();
    const { res, json } = await create({ type: "callout", initial: { calloutTitle: "Note", body: '<p>ok</p><script>alert(1)</script>' } });
    expect(res.status).toBe(200);
    expect(json.calloutTitle).toBe("Note");
    expect(json.body).toBe("<p>ok</p>");
  });

  it("rejects fields that don't belong to the block's type, on create and update", async () => {
    await setup();
    const bad = await create({ type: "text", initial: { calloutColor: "#ffffff" } });
    expect(bad.res.status).toBe(400);

    const { json: block } = await create({ type: "text" });
    const res = await PATCH(request("PATCH", { id: block.id, imageUrl: "https://example.com/a.png" }));
    expect(res.status).toBe(400);
  });

  it("accepts only https media URLs, and a linked URL replaces an uploaded Stream id", async () => {
    await setup();
    const { json: block } = await create({ type: "video", initial: { mediaId: "stream-uid" } });

    expect((await PATCH(request("PATCH", { id: block.id, mediaUrl: "http://example.com/v.mp4" }))).status).toBe(400);
    expect((await PATCH(request("PATCH", { id: block.id, mediaUrl: "javascript:alert(1)" }))).status).toBe(400);

    const res = await PATCH(request("PATCH", { id: block.id, mediaUrl: "https://cdn.example.com/v.mp4" }));
    const updated = (await res.json()) as { mediaUrl: string; mediaId: string | null };
    expect(updated.mediaUrl).toBe("https://cdn.example.com/v.mp4");
    expect(updated.mediaId).toBeNull();
  });

  it("reorders a whole lesson, and rejects a list that mixes lessons or leaves a block out", async () => {
    await setup();
    const a = (await create({ type: "text" })).json;
    const b = (await create({ type: "image" })).json;
    const [foreign] = await db.insert(contentBlocks).values({ lessonId: otherLessonId, type: "text", orderIndex: 0 }).returning();

    const mixed = await PATCH(request("PATCH", { reorder: [{ id: a.id, orderIndex: 0 }, { id: foreign!.id, orderIndex: 1 }] }));
    expect(mixed.status).toBe(400);

    const partial = await PATCH(request("PATCH", { reorder: [{ id: a.id, orderIndex: 0 }] }));
    expect(partial.status).toBe(409);

    const ok = await PATCH(request("PATCH", { reorder: [{ id: b.id, orderIndex: 0 }, { id: a.id, orderIndex: 1 }] }));
    expect(ok.status).toBe(200);
    expect((await orderedTypes()).map((r) => r.type)).toEqual(["image", "text"]);
    expect((await orderedTypes(otherLessonId))[0]!.orderIndex).toBe(0);
  });

  it("re-compacts order after a delete", async () => {
    await setup();
    await create({ type: "text" });
    const middle = (await create({ type: "image" })).json;
    await create({ type: "audio" });

    expect((await DELETE(request("DELETE", { id: middle.id }))).status).toBe(200);
    expect((await orderedTypes()).map((r) => [r.type, r.orderIndex])).toEqual([
      ["text", 0],
      ["audio", 1],
    ]);
  });

  it("refuses to delete a question readers have answered (previously an unhandled 500)", async () => {
    await setup();
    const question = (await create({ type: "question", initial: { questionPrompt: "Why?" } })).json;
    const [reader] = await db.insert(users).values({ email: `blocks-reader-${randomUUID()}@example.com`, role: "user" }).returning();
    try {
      await db.insert(responses).values({ userId: reader!.id, contentBlockId: question.id, answerText: "Because." });
      const res = await DELETE(request("DELETE", { id: question.id }));
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: string }).error).toBe("has_responses");
    } finally {
      await db.delete(responses).where(eq(responses.userId, reader!.id));
      await db.delete(users).where(eq(users.id, reader!.id));
    }
  });

  it("deletes a question whose only answers are the admin's own preview answers", async () => {
    await setup();
    const question = (await create({ type: "question", initial: { questionPrompt: "Why?" } })).json;
    await db.insert(responses).values({ userId: adminUserId, contentBlockId: question.id, answerText: "Testing." });

    expect((await DELETE(request("DELETE", { id: question.id }))).status).toBe(200);
    expect(await db.$count(responses, eq(responses.contentBlockId, question.id))).toBe(0);
  });

  it("appending to a lesson with gaps in its order renumbers instead of tying", async () => {
    await setup();
    await db.insert(contentBlocks).values([
      { lessonId, type: "text", orderIndex: 0 },
      { lessonId, type: "image", orderIndex: 2 },
      { lessonId, type: "audio", orderIndex: 3 },
    ]);
    await create({ type: "question" });
    expect((await orderedTypes()).map((r) => [r.type, r.orderIndex])).toEqual([
      ["text", 0],
      ["image", 1],
      ["audio", 2],
      ["question", 3],
    ]);
  });

  it("refuses to delete a question that a Study station owns", async () => {
    await setup();
    const question = (await create({ type: "question", initial: { questionPrompt: "Why?" } })).json;
    const studyContent = { stations: [{ questionBlockId: question.id }] } as unknown as StudyWeekContent;
    await db.update(lessons).set({ studyContent }).where(eq(lessons.id, lessonId));

    const res = await DELETE(request("DELETE", { id: question.id }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("owned_by_station");
  });
});
