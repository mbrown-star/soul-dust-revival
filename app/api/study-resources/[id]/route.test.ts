import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { entitlements, products, studies, studyResources, users } from "@/lib/db/schema";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/r2/download", () => ({
  createSignedDownloadUrl: vi.fn(async (key: string, fileName: string) => `https://r2.example.com/signed/${key}?name=${encodeURIComponent(fileName)}`),
}));

const { GET } = await import("./route");
const { getSession } = await import("@/lib/auth/session");
const { createSignedDownloadUrl } = await import("@/lib/r2/download");

let db: Db;
let readerId: string;
let adminId: string;
let productId: string;
let studyId: string;
let resourceId: string;
const fileKey = `study-resources/${randomUUID()}.pdf`;

const download = (id = resourceId) =>
  GET(new NextRequest(`https://example.com/api/study-resources/${id}`), { params: Promise.resolve({ id }) });
const signIn = (userId: string | null) =>
  vi.mocked(getSession).mockResolvedValue(userId ? { userId, email: "reader@example.com" } : null);

beforeEach(async () => {
  db = await getDb();
  vi.mocked(createSignedDownloadUrl).mockClear();
  const [reader] = await db.insert(users).values({ email: `reader-${randomUUID()}@example.com`, role: "user" }).returning();
  const [admin] = await db.insert(users).values({ email: `admin-${randomUUID()}@example.com`, role: "admin" }).returning();
  readerId = reader!.id;
  adminId = admin!.id;
  const [product] = await db
    .insert(products)
    .values({ type: "study_access", format: "digital", title: "Download test", slug: `download-test-${randomUUID()}`, priceCents: 100 })
    .returning();
  productId = product!.id;
  const [study] = await db
    .insert(studies)
    .values({ productId, title: "Download study", slug: `download-study-${randomUUID()}`, kind: "study", published: true })
    .returning();
  studyId = study!.id;
  const [resource] = await db
    .insert(studyResources)
    .values({ studyId, title: "Catalog", fileKey, fileName: "Benedictions Catalog.pdf", fileSize: 91_146, contentType: "application/pdf" })
    .returning();
  resourceId = resource!.id;
});

afterEach(async () => {
  await db.delete(studyResources).where(eq(studyResources.studyId, studyId));
  await db.delete(entitlements).where(eq(entitlements.productId, productId));
  await db.delete(studies).where(eq(studies.id, studyId));
  await db.delete(products).where(eq(products.id, productId));
  await db.delete(users).where(eq(users.id, readerId));
  await db.delete(users).where(eq(users.id, adminId));
});

describe("GET /api/study-resources/[id]", () => {
  it("sends a signed-out visitor to sign in, then back to the study", async () => {
    signIn(null);
    const res = await download();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/login\?next=%2Fstudies%2Fdownload-study-/);
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses a reader who doesn't own the study", async () => {
    signIn(readerId);
    expect((await download()).status).toBe(403);
    expect(createSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("sends an owner to a signed link under the file's own name, uncached", async () => {
    await db.insert(entitlements).values({ userId: readerId, productId, source: "purchase" });
    signIn(readerId);
    const res = await download();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain(`/signed/${fileKey}`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(createSignedDownloadUrl).toHaveBeenCalledWith(fileKey, "Benedictions Catalog.pdf", "application/pdf");
  });

  it("hides a draft study's resources from an owner, but not from an admin", async () => {
    await db.update(studies).set({ published: false }).where(eq(studies.id, studyId));
    await db.insert(entitlements).values({ userId: readerId, productId, source: "purchase" });
    signIn(readerId);
    expect((await download()).status).toBe(404);
    signIn(adminId);
    expect((await download()).status).toBe(302);
  });

  it("is 404 for an unknown or malformed id", async () => {
    signIn(adminId);
    expect((await download(randomUUID())).status).toBe(404);
    expect((await download("not-a-uuid")).status).toBe(404);
  });
});
