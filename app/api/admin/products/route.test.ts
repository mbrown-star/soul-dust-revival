import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { products, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { POST, PATCH } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

const MAX_FEATURED_PRODUCTS = 8;
const TEST_PRODUCT_TITLE = "Test Product (route.test.ts)";

function request(body: unknown, method: "POST" | "PATCH" = "POST") {
  return new NextRequest("https://example.com/api/admin/products", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function baseProduct(overrides: Record<string, unknown> = {}) {
  return {
    title: TEST_PRODUCT_TITLE,
    slug: `test-product-${randomUUID()}`,
    priceCents: 1000,
    format: "digital",
    type: "study_access",
    active: true,
    ...overrides,
  };
}

// This tests a cross-row limit ("no more than 8 featured") against the real
// shared database (see BUILD_TASKS.md -- there's no disposable local test
// DB), so a test can't just assume it starts from zero featured products:
// it fills up to whatever headroom actually exists right now, rather than
// hardcoding 8 iterations.
async function currentFeaturedCount(db: Db): Promise<number> {
  const rows = await db.select({ id: products.id }).from(products).where(eq(products.featured, true));
  return rows.length;
}

describe("admin products route — featured limit", () => {
  let createdProductIds: string[];
  let adminUserId: string;
  let db: Db;

  afterEach(async () => {
    if (createdProductIds?.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    vi.mocked(requireAdmin).mockReset();
  });

  // Safety net, not the primary cleanup: if a bug ever again lets an id go
  // untracked (the exact failure mode that previously left 11 "Test
  // Product" rows live on the real site), this catches it instead of
  // leaking test data into production. Scoped to this file's own
  // distinctive title so it can never touch a real admin's product.
  afterAll(async () => {
    const db = await getDb();
    await db.delete(products).where(eq(products.title, TEST_PRODUCT_TITLE));
  });

  async function signInAsAdmin() {
    db = await getDb();
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${randomUUID()}@example.com`, role: "admin" })
      .returning();
    adminUserId = admin!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminUserId, email: "admin@example.com", role: "admin" });
  }

  // Creates products until `featured` is at the cap, asserting each create
  // succeeds and only ever recording a real id (never pushes `undefined` on
  // a failed create, which previously corrupted this test's own cleanup
  // query and masked the real failure behind an unrelated DB error).
  async function fillFeaturedToLimit() {
    const toCreate = Math.max(0, MAX_FEATURED_PRODUCTS - (await currentFeaturedCount(db)));
    for (let i = 0; i < toCreate; i++) {
      const res = await POST(request(baseProduct({ featured: true })));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { id?: string };
      if (json.id) createdProductIds.push(json.id);
    }
  }

  it("rejects featuring a 9th product once 8 are already featured", async () => {
    createdProductIds = [];
    await signInAsAdmin();
    await fillFeaturedToLimit();

    const res = await POST(request(baseProduct({ featured: true })));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("too_many_featured");
  });

  it("allows a 9th non-featured product even at the featured limit", async () => {
    createdProductIds = [];
    await signInAsAdmin();
    await fillFeaturedToLimit();

    const res = await POST(request(baseProduct({ featured: false })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id?: string };
    if (json.id) createdProductIds.push(json.id);
  });

  it("allows re-saving an already-featured product at the limit (not a new addition)", async () => {
    createdProductIds = [];
    await signInAsAdmin();
    await fillFeaturedToLimit();

    const featuredId = createdProductIds[0];
    expect(featuredId).toBeTruthy();

    const res = await PATCH(request({ ...baseProduct({ featured: true }), id: featuredId }, "PATCH"));
    expect(res.status).toBe(200);
  });
});
