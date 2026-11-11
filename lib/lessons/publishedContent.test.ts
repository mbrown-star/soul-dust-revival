import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { contentBlocks, entitlements, lessons, products, responses, studies, users } from "@/lib/db/schema";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { readerContent, toBlockData, workingBlockRows, ensureSnapshot, discardChanges } from "./publishedContent";

// Draft and publish end to end, through the real admin and reader routes:
// admin writes go to the working copy, readers keep the published snapshot.

vi.mock("@/lib/admin/guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/guard")>()),
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/stream/signing", () => ({ generateSignedStreamUrl: (id: string) => `https://stream.example/${id}` }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const blocksRoute = await import("@/app/api/admin/content-blocks/route");
const lessonsRoute = await import("@/app/api/admin/lessons/route");
const responsesRoute = await import("@/app/api/responses/route");
const signRoute = await import("@/app/api/stream/sign-url/route");
const { requireAdmin } = await import("@/lib/admin/guard");
const { getSession } = await import("@/lib/auth/session");

function req(url: string, method: string, body: unknown) {
  return new NextRequest(`https://example.com${url}`, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

describe("draft and publish", () => {
  let db: Db;
  let adminId: string;
  let readerId: string;
  let productId: string;
  let studyId: string;
  let lessonId: string;
  let textId: string;
  let questionId: string;
  let videoId: string;

  const asAdmin = () => {
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminId, email: "a@example.com", role: "admin" });
    vi.mocked(getSession).mockResolvedValue({ userId: adminId, email: "a@example.com" });
  };
  const asReader = () => vi.mocked(getSession).mockResolvedValue({ userId: readerId, email: "r@example.com" });
  const lessonRow = async () => (await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) }))!;
  const rowsOf = async () =>
    db.select().from(contentBlocks).where(eq(contentBlocks.lessonId, lessonId)).orderBy(asc(contentBlocks.orderIndex));
  const patchBlock = (body: unknown) => blocksRoute.PATCH(req("/api/admin/content-blocks", "PATCH", body));
  const lessonAction = (action: string) => lessonsRoute.PATCH(req("/api/admin/lessons", "PATCH", { id: lessonId, action }));
  const sign = (body: unknown) => signRoute.POST(req("/api/stream/sign-url", "POST", body));

  beforeEach(async () => {
    db = await getDb();
    const [admin] = await db.insert(users).values({ email: `dp-admin-${randomUUID()}@example.com`, role: "admin" }).returning();
    const [reader] = await db.insert(users).values({ email: `dp-reader-${randomUUID()}@example.com` }).returning();
    adminId = admin!.id;
    readerId = reader!.id;
    const [product] = await db
      .insert(products)
      .values({ type: "study_access", format: "digital", title: "DP", slug: `dp-${randomUUID()}`, priceCents: 100 })
      .returning();
    productId = product!.id;
    const [study] = await db.insert(studies).values({ productId, title: "DP Study", slug: `dp-${randomUUID()}`, published: true }).returning();
    studyId = study!.id;
    await db.insert(entitlements).values({ userId: readerId, productId, source: "purchase" });
    const [lesson] = await db.insert(lessons).values({ studyId, title: "Week 1", orderIndex: 0, published: true }).returning();
    lessonId = lesson!.id;
    const inserted = await db
      .insert(contentBlocks)
      .values([
        { lessonId, orderIndex: 0, type: "text", body: "<p>Published text</p>" },
        { lessonId, orderIndex: 1, type: "question", questionPrompt: "Published question?" },
        { lessonId, orderIndex: 2, type: "video", mediaId: "uid-published", transcript: "t" },
      ])
      .returning();
    [textId, questionId, videoId] = inserted.map((b) => b.id) as [string, string, string];
    asAdmin();
  });

  afterEach(async () => {
    const ids = (await db.select({ id: contentBlocks.id }).from(contentBlocks).where(eq(contentBlocks.lessonId, lessonId))).map((b) => b.id);
    if (ids.length) await db.delete(responses).where(inArray(responses.contentBlockId, ids));
    await db.delete(contentBlocks).where(eq(contentBlocks.lessonId, lessonId));
    await db.delete(lessons).where(eq(lessons.studyId, studyId));
    await db.delete(studies).where(eq(studies.id, studyId));
    await db.delete(entitlements).where(eq(entitlements.productId, productId));
    await db.delete(products).where(eq(products.id, productId));
    await db.delete(users).where(inArray(users.id, [adminId, readerId]));
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(getSession).mockReset();
  });

  it("an edit to a published lesson goes to the draft; readers keep the published version", async () => {
    expect((await lessonRow()).publishedContent).toBeNull();

    expect((await patchBlock({ id: textId, body: "<p>Draft text</p>" })).status).toBe(200);

    const lesson = await lessonRow();
    expect(lesson.hasDraftChanges).toBe(true);
    expect(lesson.publishedContent?.blocks.map((b) => b.body ?? b.questionPrompt ?? b.mediaId)).toEqual([
      "<p>Published text</p>",
      "Published question?",
      "uid-published",
    ]);
    const working = (await workingBlockRows(db, lessonId)).map(toBlockData);
    expect(readerContent(lesson, working, { draftPreview: false }).blocks[0]!.body).toBe("<p>Published text</p>");
    const preview = readerContent(lesson, working, { draftPreview: true });
    expect(preview.blocks[0]!.body).toBe("<p>Draft text</p>");
    expect(preview.isDraftPreview).toBe(true);
  });

  it("a draft lesson has no snapshot, so readers and the builder share one copy", async () => {
    await db.update(lessons).set({ published: false }).where(eq(lessons.id, lessonId));
    await patchBlock({ id: textId, body: "<p>Edited draft</p>" });
    const lesson = await lessonRow();
    expect(lesson.publishedContent).toBeNull();
    expect(lesson.hasDraftChanges).toBe(false);
  });

  it("a removed block the published version shows stays answerable, and is purged on publish only if unanswered", async () => {
    const del = (id: string) => blocksRoute.DELETE(req("/api/admin/content-blocks", "DELETE", { id }));
    expect((await del(questionId)).status).toBe(200);
    expect((await del(textId)).status).toBe(200);

    let rows = await rowsOf();
    expect(rows.find((r) => r.id === questionId)?.removedAt).not.toBeNull();
    expect(rows.find((r) => r.id === textId)?.removedAt).not.toBeNull();
    expect((await workingBlockRows(db, lessonId)).map((r) => r.id)).toEqual([videoId]);

    asReader();
    const answer = await responsesRoute.POST(req("/api/responses", "POST", { contentBlockId: questionId, answerText: "Still here" }));
    expect(answer.status).toBe(200);

    asAdmin();
    expect((await lessonAction("publishChanges")).status).toBe(200);
    rows = await rowsOf();
    expect(rows.find((r) => r.id === textId)).toBeUndefined(); // unanswered: purged
    expect(rows.find((r) => r.id === questionId)?.removedAt).not.toBeNull(); // answered: kept, hidden
    const lesson = await lessonRow();
    expect(lesson.hasDraftChanges).toBe(false);
    expect(lesson.publishedContent?.blocks.map((b) => b.id)).toEqual([videoId]);
  });

  it("a block added since publishing is deleted outright when removed", async () => {
    const created = (await (await blocksRoute.POST(req("/api/admin/content-blocks", "POST", { lessonId, type: "text" }))).json()) as { id: string };
    await blocksRoute.DELETE(req("/api/admin/content-blocks", "DELETE", { id: created.id }));
    expect((await rowsOf()).find((r) => r.id === created.id)).toBeUndefined();
  });

  it("Discard puts the working copy back exactly as published", async () => {
    await patchBlock({ id: textId, body: "<p>Draft text</p>" });
    await patchBlock({ reorder: [{ id: videoId, orderIndex: 0 }, { id: textId, orderIndex: 1 }, { id: questionId, orderIndex: 2 }] });
    const added = (await (await blocksRoute.POST(req("/api/admin/content-blocks", "POST", { lessonId, type: "text" }))).json()) as { id: string };
    await blocksRoute.DELETE(req("/api/admin/content-blocks", "DELETE", { id: questionId }));

    expect((await lessonAction("discardChanges")).status).toBe(200);

    const working = await workingBlockRows(db, lessonId);
    expect(working.map((r) => r.id)).toEqual([textId, questionId, videoId]);
    expect(working[0]!.body).toBe("<p>Published text</p>");
    expect((await rowsOf()).find((r) => r.id === added.id)).toBeUndefined();
    expect((await lessonRow()).hasDraftChanges).toBe(false);
  });

  it("Discard restores the published week too", async () => {
    const week = { subtitle: "Published week" } as unknown as StudyWeekContent;
    await db.update(lessons).set({ studyContent: week }).where(eq(lessons.id, lessonId));
    await db.transaction((tx) => ensureSnapshot(tx, lessonId));
    await db.update(lessons).set({ studyContent: { subtitle: "Draft week" } as unknown as StudyWeekContent }).where(eq(lessons.id, lessonId));

    await db.transaction((tx) => discardChanges(tx, lessonId, adminId));
    expect((await lessonRow()).studyContent?.subtitle).toBe("Published week");
  });

  it("Publish changes makes the draft what readers see", async () => {
    await patchBlock({ id: textId, body: "<p>Draft text</p>" });
    await lessonAction("publishChanges");
    const lesson = await lessonRow();
    expect(lesson.publishedContent?.blocks[0]!.body).toBe("<p>Draft text</p>");
    expect(lesson.hasDraftChanges).toBe(false);
  });

  it("publishing freezes the current content, unpublishing clears it, and a title edit changes neither", async () => {
    const update = (body: Record<string, unknown>) =>
      lessonsRoute.PATCH(req("/api/admin/lessons", "PATCH", { id: lessonId, title: "Week 1", ...body }));
    await update({ published: false });
    expect((await lessonRow()).publishedContent).toBeNull();

    await patchBlock({ id: textId, body: "<p>Written while a draft</p>" });
    await update({ published: true });
    let lesson = await lessonRow();
    expect(lesson.publishedContent?.blocks[0]!.body).toBe("<p>Written while a draft</p>");
    expect(lesson.hasDraftChanges).toBe(false);
    const publishedAt = lesson.publishedContent!.publishedAt;

    await update({ published: true, title: "Week 1 renamed" });
    lesson = await lessonRow();
    expect(lesson.title).toBe("Week 1 renamed");
    expect(lesson.publishedContent?.publishedAt).toBe(publishedAt);

    await update({ published: false });
    lesson = await lessonRow();
    expect(lesson.publishedContent).toBeNull();
    expect(lesson.hasDraftChanges).toBe(false);
  });

  it("Publish all freezes each newly published lesson", async () => {
    await db.update(lessons).set({ published: false }).where(eq(lessons.id, lessonId));
    const res = await lessonsRoute.PATCH(req("/api/admin/lessons", "PATCH", { studyId, published: true }));
    expect(res.status).toBe(200);
    expect((await lessonRow()).publishedContent?.blocks).toHaveLength(3);
  });

  it("readers sign the published video; only an admin previewing the draft gets the draft's", async () => {
    await patchBlock({ id: videoId, mediaId: "uid-draft" });

    asReader();
    expect(await (await sign({ contentBlockId: videoId })).json()).toEqual({ url: "https://stream.example/uid-published" });
    expect(await (await sign({ contentBlockId: videoId, draft: true })).json()).toEqual({ url: "https://stream.example/uid-published" });

    asAdmin();
    expect(await (await sign({ contentBlockId: videoId })).json()).toEqual({ url: "https://stream.example/uid-published" });
    expect(await (await sign({ contentBlockId: videoId, draft: true })).json()).toEqual({ url: "https://stream.example/uid-draft" });
  });

  it("a reader can't sign a video that exists only in the draft", async () => {
    await patchBlock({ id: textId, body: "<p>touch</p>" }); // snapshot first
    const created = (await (
      await blocksRoute.POST(req("/api/admin/content-blocks", "POST", { lessonId, type: "video", initial: { mediaId: "uid-new" } }))
    ).json()) as { id: string };
    asReader();
    expect((await sign({ contentBlockId: created.id })).status).toBe(404);
  });

  it("Publish and Discard are admin-only, and Publish refuses a draft lesson", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await lessonAction("publishChanges")).status).toBe(403);
    expect((await lessonAction("discardChanges")).status).toBe(403);

    asAdmin();
    await db.update(lessons).set({ published: false }).where(eq(lessons.id, lessonId));
    expect((await lessonAction("publishChanges")).status).toBe(400);
    expect((await lessonsRoute.PATCH(req("/api/admin/lessons", "PATCH", { id: lessonId, action: "deleteEverything" }))).status).toBe(400);
  });

  it("Undo after removing a published block brings back the original row, not a copy", async () => {
    const res = await blocksRoute.DELETE(req("/api/admin/content-blocks", "DELETE", { id: questionId }));
    expect(await res.json()).toEqual({ ok: true, setAside: true });

    const restored = await patchBlock({ restore: questionId, insertAt: 1 });
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as { id: string }).id).toBe(questionId);
    expect((await workingBlockRows(db, lessonId)).map((r) => r.id)).toEqual([textId, questionId, videoId]);

    // A block added after publishing isn't set aside, so there's nothing to restore.
    const created = (await (await blocksRoute.POST(req("/api/admin/content-blocks", "POST", { lessonId, type: "text" }))).json()) as { id: string };
    expect(await (await blocksRoute.DELETE(req("/api/admin/content-blocks", "DELETE", { id: created.id }))).json()).toEqual({ ok: true, setAside: false });
    expect((await patchBlock({ restore: created.id, insertAt: 0 })).status).toBe(404);
  });

  it("readers can answer only questions the published version shows; an admin previewing the draft can answer its new ones", async () => {
    await patchBlock({ id: textId, body: "<p>x</p>" }); // snapshot first
    const created = (await (
      await blocksRoute.POST(req("/api/admin/content-blocks", "POST", { lessonId, type: "question", initial: { questionPrompt: "Draft only?" } }))
    ).json()) as { id: string };
    const answer = (contentBlockId: string) =>
      responsesRoute.POST(req("/api/responses", "POST", { contentBlockId, answerText: "An answer" }));

    asReader();
    expect((await answer(created.id)).status).toBe(404);
    expect((await answer(questionId)).status).toBe(200);
    asAdmin();
    expect((await answer(created.id)).status).toBe(200);
  });

  it("sanity: the reader's published question is the row readers answer", async () => {
    await patchBlock({ id: textId, body: "<p>x</p>" });
    const lesson = await lessonRow();
    const shownQuestion = readerContent(lesson, [], { draftPreview: false }).blocks.find((b) => b.type === "question");
    const row = await db.query.contentBlocks.findFirst({ where: and(eq(contentBlocks.id, shownQuestion!.id), eq(contentBlocks.lessonId, lessonId)) });
    expect(row).toBeTruthy();
  });
});
