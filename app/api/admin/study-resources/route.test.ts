import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { products, studies, studyResources, users } from "@/lib/db/schema";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));
const sendMock = vi.fn();
vi.mock("@/lib/r2/client", () => ({
  r2: { send: (...args: unknown[]) => sendMock(...args) },
  R2_BUCKET: "test-bucket",
  r2PublicUrl: (key: string) => `https://assets.example.com/${key}`,
  IMMUTABLE_CACHE_CONTROL: "public, max-age=31536000, immutable",
}));
vi.mock("@/lib/r2/upload", async () => ({
  createPresignedUploadUrl: vi.fn(async (key: string) => ({
    uploadUrl: `https://r2.example.com/signed/${key}`,
    publicUrl: `https://assets.example.com/${key}`,
  })),
  invalidUploadResponse: (await vi.importActual<typeof import("@/lib/r2/upload")>("@/lib/r2/upload")).invalidUploadResponse,
}));

const resourcesRoute = await import("./route");
const uploadRoute = await import("../study-resource-upload-url/route");
const studiesRoute = await import("../studies/route");
const { requireAdmin } = await import("@/lib/admin/guard");

const key = () => `study-resources/${randomUUID()}.pdf`;
const request = (method: string, body: unknown, path = "/api/admin/study-resources") =>
  new NextRequest(`https://example.com${path}`, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

let db: Db;
let adminId: string;
let productId: string;
let studyId: string;

beforeEach(async () => {
  db = await getDb();
  sendMock.mockReset();
  sendMock.mockImplementation(async (command: unknown) => {
    if (command instanceof HeadObjectCommand) return { ContentLength: 91_146, ContentType: "application/pdf" };
    return {};
  });
  const [admin] = await db.insert(users).values({ email: `admin-${randomUUID()}@example.com`, role: "admin" }).returning();
  adminId = admin!.id;
  vi.mocked(requireAdmin).mockResolvedValue({ userId: adminId, email: "admin@example.com", role: "admin" });
  const [product] = await db
    .insert(products)
    .values({ type: "study_access", format: "digital", title: "Resource test", slug: `resource-test-${randomUUID()}`, priceCents: 100 })
    .returning();
  productId = product!.id;
  const [study] = await db
    .insert(studies)
    .values({ productId, title: "Resource test study", slug: `resource-study-${randomUUID()}`, kind: "study" })
    .returning();
  studyId = study!.id;
});

afterEach(async () => {
  await db.delete(studyResources).where(eq(studyResources.studyId, studyId));
  await db.delete(studies).where(eq(studies.id, studyId));
  await db.delete(products).where(eq(products.id, productId));
  await db.delete(users).where(eq(users.id, adminId));
  vi.mocked(requireAdmin).mockReset();
});

async function add(title: string) {
  const res = await resourcesRoute.POST(request("POST", { studyId, title, fileKey: key(), fileName: `${title}.pdf` }));
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; orderIndex: number; fileSize: number; contentType: string; fileName: string };
}

describe("study resource upload link", () => {
  it("is admin-only, picks the key itself, and returns no public URL", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await uploadRoute.POST(request("POST", { contentType: "application/pdf", size: 10 }))).status).toBe(403);

    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminId, email: "admin@example.com", role: "admin" });
    const res = await uploadRoute.POST(request("POST", { contentType: "application/pdf", size: 91_146 }));
    const json = (await res.json()) as Record<string, string>;
    expect(json.key).toMatch(/^study-resources\/[0-9a-f-]{36}\.pdf$/);
    expect(json.uploadUrl).toContain(json.key);
    expect(json).not.toHaveProperty("publicUrl");
  });

  it("refuses a non-PDF, a file over 100 MB, or a client-chosen key", async () => {
    expect((await uploadRoute.POST(request("POST", { contentType: "image/png", size: 10 }))).status).toBe(400);
    expect((await uploadRoute.POST(request("POST", { contentType: "application/pdf", size: 100 * 1024 * 1024 + 1 }))).status).toBe(400);
    expect((await uploadRoute.POST(request("POST", { key: "x.pdf", contentType: "application/pdf", size: 10 }))).status).toBe(400);
  });
});

describe("POST /api/admin/study-resources", () => {
  it("adds a resource with its size and type from storage, appended in order", async () => {
    const first = await add("Catalog");
    const second = await add("Guide");
    expect([first.orderIndex, second.orderIndex]).toEqual([0, 1]);
    expect(first).toMatchObject({ fileSize: 91_146, contentType: "application/pdf", fileName: "Catalog.pdf" });
    expect(sendMock.mock.calls.some(([c]) => c instanceof HeadObjectCommand)).toBe(true);
  });

  it("refuses a key the upload route didn't issue, a missing upload, an unknown study, or a non-admin", async () => {
    const bad = (body: Record<string, unknown>) => resourcesRoute.POST(request("POST", { studyId, title: "T", fileName: "t.pdf", fileKey: key(), ...body }));
    expect((await bad({ fileKey: "products/abc.pdf" })).status).toBe(400);
    expect((await bad({ fileKey: "study-resources/../products/x.pdf" })).status).toBe(400);
    expect((await bad({ studyId: randomUUID() })).status).toBe(404);

    sendMock.mockRejectedValueOnce(new Error("NotFound"));
    expect((await bad({})).status).toBe(400);

    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await bad({})).status).toBe(403);
    expect(await db.select().from(studyResources).where(eq(studyResources.studyId, studyId))).toEqual([]);
  });

  it("strips path characters from the download name", async () => {
    const res = await resourcesRoute.POST(request("POST", { studyId, title: "T", fileKey: key(), fileName: "../../evil\\name.pdf" }));
    expect(((await res.json()) as { fileName: string }).fileName).toBe(".._.._evil_name.pdf");
  });
});

describe("PATCH and DELETE /api/admin/study-resources", () => {
  it("renames, reorders, and refuses a reorder that isn't exactly this study's resources", async () => {
    const a = await add("A");
    const b = await add("B");

    const renamed = await resourcesRoute.PATCH(request("PATCH", { id: a.id, title: "Catalog", description: "A companion list" }));
    expect(((await renamed.json()) as { title: string; description: string }).title).toBe("Catalog");

    expect((await resourcesRoute.PATCH(request("PATCH", { studyId, order: [b.id, a.id] }))).status).toBe(200);
    const rows = await db.select().from(studyResources).where(eq(studyResources.studyId, studyId));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.orderIndex]))).toEqual({ [b.id]: 0, [a.id]: 1 });

    expect((await resourcesRoute.PATCH(request("PATCH", { studyId, order: [a.id] }))).status).toBe(409);
    expect((await resourcesRoute.PATCH(request("PATCH", { studyId, order: [a.id, randomUUID()] }))).status).toBe(409);
  });

  it("removes the row and its file", async () => {
    const a = await add("A");
    const [row] = await db.select().from(studyResources).where(eq(studyResources.id, a.id));
    sendMock.mockClear();
    expect((await resourcesRoute.DELETE(request("DELETE", { id: a.id }))).status).toBe(200);
    expect(await db.select().from(studyResources).where(eq(studyResources.id, a.id))).toEqual([]);
    const deleted = sendMock.mock.calls.map(([c]) => c).find((c) => c instanceof DeleteObjectCommand) as DeleteObjectCommand;
    expect(deleted.input.Key).toBe(row!.fileKey);
  });

  it("deleting the study removes its resources and their files", async () => {
    const a = await add("A");
    const b = await add("B");
    sendMock.mockClear();
    expect((await studiesRoute.DELETE(request("DELETE", { id: studyId }, "/api/admin/studies"))).status).toBe(200);
    expect(await db.select().from(studyResources).where(inArray(studyResources.id, [a.id, b.id]))).toEqual([]);
    expect(sendMock.mock.calls.filter(([c]) => c instanceof DeleteObjectCommand)).toHaveLength(2);
  });
});
