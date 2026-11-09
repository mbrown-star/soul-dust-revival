import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { products, bundleItems, users, orderItems, orders, entitlements } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

const { POST, PATCH, DELETE } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

const TEST_PRODUCT_TITLE = "Test Component (bundles/route.test.ts)";
const TEST_BUNDLE_TITLE = "Test Bundle (bundles/route.test.ts)";

function request(body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") {
  return new NextRequest("https://example.com/api/admin/bundles", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function baseBundle(componentProductIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    title: TEST_BUNDLE_TITLE,
    slug: `test-bundle-${randomUUID()}`,
    priceCents: 4900,
    format: "digital",
    active: true,
    componentProductIds,
    ...overrides,
  };
}

async function makeComponent(db: Db, overrides: Record<string, unknown> = {}) {
  const [component] = await db
    .insert(products)
    .values({
      title: TEST_PRODUCT_TITLE,
      slug: `test-component-${randomUUID()}`,
      priceCents: 1000,
      format: "digital",
      type: "study_access",
      active: true,
      ...overrides,
    } as typeof products.$inferInsert)
    .returning();
  return component!;
}

describe("admin bundles route", () => {
  let adminUserId: string;
  let db: Db;
  let createdProductIds: string[];
  let createdBundleIds: string[];

  async function signInAsAdmin() {
    db = await getDb();
    const [admin] = await db
      .insert(users)
      .values({ email: `admin-${randomUUID()}@example.com`, role: "admin" })
      .returning();
    adminUserId = admin!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: adminUserId, email: "admin@example.com", role: "admin" });
  }

  afterEach(async () => {
    if (createdBundleIds?.length) {
      await db.delete(bundleItems).where(inArray(bundleItems.bundleProductId, createdBundleIds));
      await db.delete(products).where(inArray(products.id, createdBundleIds));
    }
    if (createdProductIds?.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (adminUserId) await db.delete(users).where(eq(users.id, adminUserId));
    vi.mocked(requireAdmin).mockReset();
    createdProductIds = [];
    createdBundleIds = [];
  });

  // Safety net matching app/api/admin/products/route.test.ts's own, in case
  // a bug ever leaves an id untracked -- scoped to this file's distinctive
  // titles so it can never touch a real admin's bundle or product.
  afterAll(async () => {
    const db = await getDb();
    const leftoverBundles = await db.select({ id: products.id }).from(products).where(eq(products.title, TEST_BUNDLE_TITLE));
    if (leftoverBundles.length) {
      await db.delete(bundleItems).where(
        inArray(bundleItems.bundleProductId, leftoverBundles.map((b) => b.id))
      );
    }
    await db.delete(products).where(eq(products.title, TEST_BUNDLE_TITLE));
    await db.delete(products).where(eq(products.title, TEST_PRODUCT_TITLE));
  });

  it("creates a bundle and its bundle_items rows", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const componentA = await makeComponent(db);
    const componentB = await makeComponent(db);
    createdProductIds.push(componentA.id, componentB.id);

    const res = await POST(request(baseBundle([componentA.id, componentB.id])));
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as { id: string; type: string };
    createdBundleIds.push(bundle.id);
    expect(bundle.type).toBe("bundle");

    const items = await db.select().from(bundleItems).where(eq(bundleItems.bundleProductId, bundle.id));
    expect(items.map((i) => i.componentProductId).sort()).toEqual([componentA.id, componentB.id].sort());
  });

  it("always creates a bundle Stripe-only, never Amazon", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const res = await POST(request(baseBundle([component.id], { format: "physical" })));
    const bundle = (await res.json()) as { id: string; sellOnStripe: boolean; amazonUrl: string | null };
    createdBundleIds.push(bundle.id);
    expect(bundle.sellOnStripe).toBe(true);
    expect(bundle.amazonUrl).toBeNull();
  });

  it("creates a format \"both\" bundle with its own digital price, still Stripe-only/no Amazon", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const res = await POST(
      request(baseBundle([component.id], { format: "both", priceCents: 8000, digitalPriceCents: 5000 }))
    );
    expect(res.status).toBe(200);
    const bundle = (await res.json()) as {
      id: string;
      format: string;
      priceCents: number;
      digitalPriceCents: number | null;
      sellOnStripe: boolean;
      amazonUrl: string | null;
    };
    createdBundleIds.push(bundle.id);
    expect(bundle.format).toBe("both");
    expect(bundle.priceCents).toBe(8000);
    expect(bundle.digitalPriceCents).toBe(5000);
    expect(bundle.sellOnStripe).toBe(true);
    expect(bundle.amazonUrl).toBeNull();
  });

  it("PATCH resets the digital Stripe price/product ids when digitalPriceCents changes, leaving the physical ones alone", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const createRes = await POST(
      request(baseBundle([component.id], { format: "both", priceCents: 8000, digitalPriceCents: 5000 }))
    );
    const bundle = (await createRes.json()) as { id: string };
    createdBundleIds.push(bundle.id);

    // Simulate Stripe IDs already having been created for both sides (the
    // real flow only populates these lazily, on first checkout).
    await db
      .update(products)
      .set({
        stripeProductId: "prod_physical_test",
        stripePriceId: "price_physical_test",
        digitalStripeProductId: "prod_digital_test",
        digitalStripePriceId: "price_digital_test",
      })
      .where(eq(products.id, bundle.id));

    const patchRes = await PATCH(
      request(
        { ...baseBundle([component.id], { format: "both", priceCents: 8000, digitalPriceCents: 6000 }), id: bundle.id },
        "PATCH"
      )
    );
    expect(patchRes.status).toBe(200);

    const [updated] = await db.select().from(products).where(eq(products.id, bundle.id));
    expect(updated!.digitalPriceCents).toBe(6000);
    // Digital price changed -- its Stripe IDs are cleared so a new Price
    // gets created on next checkout, since Stripe Prices are immutable.
    expect(updated!.digitalStripeProductId).toBeNull();
    expect(updated!.digitalStripePriceId).toBeNull();
    // Physical price was unchanged -- its own Stripe IDs are left alone.
    expect(updated!.stripeProductId).toBe("prod_physical_test");
    expect(updated!.stripePriceId).toBe("price_physical_test");
  });

  it("rejects a bundle containing itself as a component (nonexistent id at create time, then checked post-creation)", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();

    const res = await POST(request(baseBundle([randomUUID()])));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("invalid_components");
  });

  it("rejects a bundle that would contain another bundle", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const innerRes = await POST(request(baseBundle([component.id])));
    const inner = (await innerRes.json()) as { id: string };
    createdBundleIds.push(inner.id);

    const outerRes = await POST(request(baseBundle([inner.id])));
    expect(outerRes.status).toBe(400);
    const json = (await outerRes.json()) as { error: string; message: string };
    expect(json.error).toBe("invalid_components");
    expect(json.message).toMatch(/another bundle/);
  });

  it("rejects duplicate component ids in the same bundle", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const res = await POST(request(baseBundle([component.id, component.id])));
    expect(res.status).toBe(400);
  });

  it("PATCH replaces the bundle's component list wholesale", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const componentA = await makeComponent(db);
    const componentB = await makeComponent(db);
    const componentC = await makeComponent(db);
    createdProductIds.push(componentA.id, componentB.id, componentC.id);

    const createRes = await POST(request(baseBundle([componentA.id, componentB.id])));
    const bundle = (await createRes.json()) as { id: string };
    createdBundleIds.push(bundle.id);

    const patchRes = await PATCH(
      request({ ...baseBundle([componentB.id, componentC.id]), id: bundle.id }, "PATCH")
    );
    expect(patchRes.status).toBe(200);

    const items = await db.select().from(bundleItems).where(eq(bundleItems.bundleProductId, bundle.id));
    expect(items.map((i) => i.componentProductId).sort()).toEqual([componentB.id, componentC.id].sort());
  });

  it("PATCH 404s for an id that isn't a bundle", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const res = await PATCH(request({ ...baseBundle([component.id]), id: component.id }, "PATCH"));
    expect(res.status).toBe(404);
  });

  it("DELETE removes a bundle with no order/entitlement history, and its bundle_items", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const createRes = await POST(request(baseBundle([component.id])));
    const bundle = (await createRes.json()) as { id: string };

    const res = await DELETE(request({ id: bundle.id }, "DELETE"));
    expect(res.status).toBe(200);

    const [stillThere] = await db.select().from(products).where(eq(products.id, bundle.id));
    expect(stillThere).toBeUndefined();
    const items = await db.select().from(bundleItems).where(eq(bundleItems.bundleProductId, bundle.id));
    expect(items).toHaveLength(0);
  });

  it("refuses to DELETE a bundle with order history", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const createRes = await POST(request(baseBundle([component.id])));
    const bundle = (await createRes.json()) as { id: string };
    createdBundleIds.push(bundle.id);

    const [order] = await db.insert(orders).values({ country: "US", status: "paid", totalCents: 4900 }).returning();
    await db.insert(orderItems).values({ orderId: order!.id, productId: bundle.id, quantity: 1 });

    try {
      const res = await DELETE(request({ id: bundle.id }, "DELETE"));
      expect(res.status).toBe(409);
    } finally {
      await db.delete(orderItems).where(eq(orderItems.orderId, order!.id));
      await db.delete(orders).where(eq(orders.id, order!.id));
    }
  });

  it("refuses to DELETE a bundle with a granted entitlement", async () => {
    createdProductIds = [];
    createdBundleIds = [];
    await signInAsAdmin();
    const component = await makeComponent(db);
    createdProductIds.push(component.id);

    const createRes = await POST(request(baseBundle([component.id])));
    const bundle = (await createRes.json()) as { id: string };
    createdBundleIds.push(bundle.id);

    await db.insert(entitlements).values({ userId: adminUserId, productId: bundle.id, source: "admin_grant" });

    try {
      const res = await DELETE(request({ id: bundle.id }, "DELETE"));
      expect(res.status).toBe(409);
    } finally {
      await db.delete(entitlements).where(eq(entitlements.productId, bundle.id));
    }
  });

  it("rejects every method when not an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await POST(request(baseBundle([randomUUID()])))).status).toBe(403);
    expect((await PATCH(request({ ...baseBundle([randomUUID()]), id: randomUUID() }, "PATCH"))).status).toBe(403);
    expect((await DELETE(request({ id: randomUUID() }, "DELETE"))).status).toBe(403);
  });
});
