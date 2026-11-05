import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { products, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { POST, PATCH } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

function request(body: unknown, method: "POST" | "PATCH" = "POST") {
  return new NextRequest("https://example.com/api/admin/products", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function baseProduct(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test Product",
    slug: `test-product-${randomUUID()}`,
    priceCents: 1000,
    format: "digital",
    type: "study_access",
    active: true,
    ...overrides,
  };
}

describe("admin products route — featured limit", () => {
  let createdProductIds: string[];
  let adminUserId: string;

  afterEach(async () => {
    if (createdProductIds?.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    vi.mocked(requireAdmin).mockReset();
  });

  async function signInAsAdmin() {
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${randomUUID()}@example.com`, role: "admin" })
      .returning();
    adminUserId = admin!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminUserId, email: "admin@example.com", role: "admin" });
  }

  it("rejects featuring a 9th product once 8 are already featured", async () => {
    createdProductIds = [];
    await signInAsAdmin();

    for (let i = 0; i < 8; i++) {
      const res = await POST(request(baseProduct({ featured: true })));
      expect(res.status).toBe(200);
      const json = (await res.json()) as { id: string };
      createdProductIds.push(json.id);
    }

    const res = await POST(request(baseProduct({ featured: true })));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("too_many_featured");
  });

  it("allows a 9th non-featured product even at the featured limit", async () => {
    createdProductIds = [];
    await signInAsAdmin();

    for (let i = 0; i < 8; i++) {
      const res = await POST(request(baseProduct({ featured: true })));
      const json = (await res.json()) as { id: string };
      createdProductIds.push(json.id);
    }

    const res = await POST(request(baseProduct({ featured: false })));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string };
    createdProductIds.push(json.id);
  });

  it("allows re-saving an already-featured product at the limit (not a new addition)", async () => {
    createdProductIds = [];
    await signInAsAdmin();

    let featuredId = "";
    for (let i = 0; i < 8; i++) {
      const res = await POST(request(baseProduct({ featured: true })));
      const json = (await res.json()) as { id: string };
      createdProductIds.push(json.id);
      if (i === 0) featuredId = json.id;
    }

    const res = await PATCH(request({ ...baseProduct({ featured: true }), id: featuredId }, "PATCH"));
    expect(res.status).toBe(200);
  });
});
