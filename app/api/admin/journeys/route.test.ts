import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { journeys } from "@/lib/db/schema";
import { createJourneyFixture } from "@/lib/testing/journeyFixture";
import { addDays, todayIn } from "@/lib/journey/schedule";

vi.mock("@/lib/admin/guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/guard")>()),
  requireAdmin: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { POST, PATCH, DELETE } = await import("./route");
const { DELETE: deleteBundle } = await import("@/app/api/admin/bundles/route");
const { requireAdmin } = await import("@/lib/admin/guard");

function request(method: string, body: unknown) {
  return new NextRequest("https://example.com/api/admin/journeys", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/admin/journeys", () => {
  let f: Awaited<ReturnType<typeof createJourneyFixture>>;

  beforeEach(async () => {
    f = await createJourneyFixture();
    vi.mocked(requireAdmin).mockResolvedValue({ ...f.admin, role: "admin" });
  });
  afterEach(async () => {
    await f.cleanup();
    vi.mocked(requireAdmin).mockReset();
  });

  it("is admin-only", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await PATCH(request("PATCH", { id: f.journey.id, published: false }))).status).toBe(403);
    expect((await DELETE(request("DELETE", { id: f.journey.id }))).status).toBe(403);
  });

  it("publishes and unpublishes", async () => {
    expect((await PATCH(request("PATCH", { id: f.journey.id, published: false }))).status).toBe(200);
    const db = await getDb();
    expect((await db.query.journeys.findFirst({ where: eq(journeys.id, f.journey.id) }))!.published).toBe(false);
  });

  it("refuses a second Journey for the same bundle, and a Journey from a non-bundle", async () => {
    const res = await POST(request("POST", { bundleProductId: f.productIds.bundle, title: "Again", slug: `again-${f.journey.slug}` }));
    expect(res.status).toBe(409);
    const notBundle = await POST(request("POST", { bundleProductId: f.productIds.partOne, title: "No", slug: `no-${f.journey.slug}` }));
    expect(notBundle.status).toBe(400);
  });

  it("won't remove a Journey someone has begun, and a Journey's bundle can't be deleted out from under it", async () => {
    await f.enroll({ weekday: 1, openedThrough: 0, nextOpensOn: addDays(todayIn("UTC"), 7) });
    expect((await DELETE(request("DELETE", { id: f.journey.id }))).status).toBe(409);
    expect((await deleteBundle(request("DELETE", { id: f.productIds.bundle }))).status).toBe(409);
  });
});
