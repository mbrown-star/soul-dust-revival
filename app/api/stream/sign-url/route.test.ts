import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { contentBlocks, entitlements, lessons, products, studies, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { StudyWeekContent } from "@/lib/study/studyContent";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
// Signing needs the real Stream private key; what's under test is who gets a URL.
vi.mock("@/lib/stream/signing", () => ({ generateSignedStreamUrl: (id: string) => `https://stream.example/${id}` }));

const { POST } = await import("./route");
const { getSession } = await import("@/lib/auth/session");

function signRequest(body: unknown) {
  return new NextRequest("https://example.com/api/stream/sign-url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function weekWithVideo(mediaId: string): StudyWeekContent {
  return {
    subtitle: "",
    keyVerse: "v",
    keyRef: "r",
    study: { sections: [{ heading: "H", paras: [], media: [{ id: randomUUID(), type: "video", mediaId }] }], parts: [] },
    passageRef: "p",
    passage: [],
    stationsLabel: "",
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
  };
}

describe("POST /api/stream/sign-url", () => {
  let db: Db;
  let userId: string;
  let productId: string;
  let studyId: string;

  async function setUp({ entitled, published = true }: { entitled: boolean; published?: boolean }) {
    db = await getDb();
    const [user] = await db.insert(users).values({ email: `sign-user-${randomUUID()}@example.com` }).returning();
    userId = user!.id;
    vi.mocked(getSession).mockResolvedValue({ userId, email: user!.email });
    const [product] = await db
      .insert(products)
      .values({ type: "study_access", format: "digital", title: "Sign Product", slug: `sign-${randomUUID()}`, priceCents: 100 })
      .returning();
    productId = product!.id;
    const [study] = await db.insert(studies).values({ productId, title: "Sign Study", slug: `sign-${randomUUID()}`, published: true }).returning();
    studyId = study!.id;
    if (entitled) await db.insert(entitlements).values({ userId, productId, source: "purchase" });
    const [lesson] = await db
      .insert(lessons)
      .values({ studyId, title: "Week", orderIndex: 0, published, studyContent: weekWithVideo("stream-uid-in-week") })
      .returning();
    return lesson!.id;
  }

  afterEach(async () => {
    if (studyId) {
      const ids = (await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, studyId))).map((l) => l.id);
      for (const id of ids) await db.delete(contentBlocks).where(eq(contentBlocks.lessonId, id));
      await db.delete(lessons).where(eq(lessons.studyId, studyId));
      await db.delete(studies).where(eq(studies.id, studyId));
    }
    if (userId) await db.delete(entitlements).where(eq(entitlements.userId, userId));
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (userId) await db.delete(users).where(eq(users.id, userId));
    vi.mocked(getSession).mockReset();
  });

  it("signs an uploaded video placed in a week for an entitled reader", async () => {
    const lessonId = await setUp({ entitled: true });
    const res = await POST(signRequest({ lessonId, mediaId: "stream-uid-in-week" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toBe("https://stream.example/stream-uid-in-week");
  });

  it("won't sign a Stream id that isn't in that week", async () => {
    const lessonId = await setUp({ entitled: true });
    expect((await POST(signRequest({ lessonId, mediaId: "some-other-video" }))).status).toBe(404);
  });

  it("refuses a reader without access, and a draft lesson to a non-admin", async () => {
    const lessonId = await setUp({ entitled: false });
    expect((await POST(signRequest({ lessonId, mediaId: "stream-uid-in-week" }))).status).toBe(403);
  });

  it("refuses an entitled reader on a draft lesson", async () => {
    const lessonId = await setUp({ entitled: true, published: false });
    expect((await POST(signRequest({ lessonId, mediaId: "stream-uid-in-week" }))).status).toBe(403);
  });

  it("still signs a content block's own uploaded video", async () => {
    const lessonId = await setUp({ entitled: true });
    const [block] = await db.insert(contentBlocks).values({ lessonId, type: "video", orderIndex: 0, mediaId: "block-uid" }).returning();
    const res = await POST(signRequest({ contentBlockId: block!.id }));
    expect(((await res.json()) as { url: string }).url).toBe("https://stream.example/block-uid");
  });

  it("requires a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    expect((await POST(signRequest({ contentBlockId: randomUUID() }))).status).toBe(401);
  });
});
