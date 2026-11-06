import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { studies, products, users, lessons, contentBlocks } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const sendMock = vi.fn().mockResolvedValue({});
vi.mock("@/lib/r2/client", () => ({
  r2: { send: sendMock },
  R2_BUCKET: "test-bucket",
  r2PublicUrl: (key: string) => `https://assets.example.com/${key}`,
}));

const parsePdfToTextMock = vi.fn();
vi.mock("@/lib/import/parsePdf", () => ({ parsePdfToText: parsePdfToTextMock }));

const { POST } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

const DEVOTIONAL_TEXT = ["Day 1", "A key thought for today.", "", "Day 2", "Another day's reflection."].join("\n");

const STUDY_TEXT = [
  "IWEEK 1",
  "The Faith That Bears Fruit",
  "from dust to living hope",
  "BOOK 1:1-8",
  "“A quoted verse.”",
  "QUESTION",
  "Am I trusting or striving?",
  "GOING DEEPER · THE GREEK",
  "χάρις",
  "charis — grace — unearned favor",
  "BOOK 1:1-8; OTHER 1:1",
  "An explanatory paragraph about grace.",
  "LIVE IT: Receive grace today.",
].join("\n");

function importRequest(formEntries: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(formEntries)) form.set(key, value);
  return new NextRequest("https://example.com/api/admin/studies/import", { method: "POST", body: form });
}

describe("POST /api/admin/studies/import", () => {
  let adminUserId: string;
  let productId: string;
  let createdStudyIds: string[] = [];
  let db: Db;

  async function signInAsAdmin() {
    db = await getDb();
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${randomUUID()}@example.com`, role: "admin" })
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
  }

  afterEach(async () => {
    for (const id of createdStudyIds) {
      const studyLessons = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.studyId, id));
      const lessonIds = studyLessons.map((l) => l.id);
      if (lessonIds.length > 0) {
        for (const lessonId of lessonIds) {
          await db.delete(contentBlocks).where(eq(contentBlocks.lessonId, lessonId));
        }
        await db.delete(lessons).where(eq(lessons.studyId, id));
      }
      await db.delete(studies).where(eq(studies.id, id));
    }
    createdStudyIds = [];
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    vi.mocked(requireAdmin).mockReset();
    parsePdfToTextMock.mockReset();
    sendMock.mockClear();
  });

  it("rejects when not an admin", async () => {
    await signInAsAdmin();
    vi.mocked(requireAdmin).mockResolvedValue(null);

    const res = await POST(
      importRequest({
        file: new File([Buffer.from("x")], "doc.pdf", { type: "application/pdf" }),
        title: "Some Study",
        slug: `some-study-${randomUUID()}`,
        productId,
        kind: "devotional",
      })
    );
    expect(res.status).toBe(403);
  });

  it("imports a devotional PDF as plain text blocks, one per lesson", async () => {
    await signInAsAdmin();
    parsePdfToTextMock.mockResolvedValue(DEVOTIONAL_TEXT);

    const slug = `devotional-${randomUUID()}`;
    const res = await POST(
      importRequest({
        file: new File([Buffer.from("x")], "doc.pdf", { type: "application/pdf" }),
        title: "A Devotional",
        slug,
        productId,
        kind: "devotional",
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { studyId: string };
    createdStudyIds.push(json.studyId);

    const [study] = await db.select().from(studies).where(eq(studies.id, json.studyId));
    expect(study!.kind).toBe("devotional");

    const studyLessons = await db
      .select()
      .from(lessons)
      .where(eq(lessons.studyId, json.studyId))
      .orderBy(asc(lessons.orderIndex));
    expect(studyLessons).toHaveLength(2);

    const blocks = await db.select().from(contentBlocks).where(eq(contentBlocks.lessonId, studyLessons[0]!.id));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("text");
  });

  it("imports a Study PDF with QUESTION and Going Deeper sections as their own content blocks", async () => {
    await signInAsAdmin();
    parsePdfToTextMock.mockResolvedValue(STUDY_TEXT);

    const slug = `study-${randomUUID()}`;
    const res = await POST(
      importRequest({
        file: new File([Buffer.from("x")], "doc.pdf", { type: "application/pdf" }),
        title: "A Study",
        slug,
        productId,
        kind: "study",
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { studyId: string };
    createdStudyIds.push(json.studyId);

    const [study] = await db.select().from(studies).where(eq(studies.id, json.studyId));
    expect(study!.kind).toBe("study");

    const [lesson] = await db.select().from(lessons).where(eq(lessons.studyId, json.studyId));
    expect(lesson!.title).toContain("The Faith That Bears Fruit");

    const blocks = await db
      .select()
      .from(contentBlocks)
      .where(eq(contentBlocks.lessonId, lesson!.id))
      .orderBy(asc(contentBlocks.orderIndex));

    const questionBlock = blocks.find((b) => b.type === "question");
    expect(questionBlock?.questionPrompt).toBe("Am I trusting or striving?");

    const calloutBlock = blocks.find((b) => b.type === "callout");
    expect(calloutBlock?.calloutTitle).toBe("χάρις");
    expect(calloutBlock?.body).toContain("explanatory paragraph");
  });

  it("defaults kind to devotional when not supplied", async () => {
    await signInAsAdmin();
    parsePdfToTextMock.mockResolvedValue(DEVOTIONAL_TEXT);

    const slug = `default-kind-${randomUUID()}`;
    const res = await POST(
      importRequest({
        file: new File([Buffer.from("x")], "doc.pdf", { type: "application/pdf" }),
        title: "Default Kind Study",
        slug,
        productId,
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { studyId: string };
    createdStudyIds.push(json.studyId);

    const [study] = await db.select().from(studies).where(eq(studies.id, json.studyId));
    expect(study!.kind).toBe("devotional");
  });
});
