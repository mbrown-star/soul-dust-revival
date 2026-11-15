import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { socialPosts, socialPostTargets } from "@/lib/db/schema";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/social/publish", () => ({ publishTarget: vi.fn() }));

const { requireAdmin } = await import("@/lib/admin/guard");
const { publishTarget } = await import("@/lib/social/publish");
const { POST } = await import("./route");
const { POST: cronPOST } = await import("@/app/api/cron/social-publish/route");

function request(body: unknown) {
  return new NextRequest("https://example.com/api/admin/social/targets/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type Target = typeof socialPostTargets.$inferSelect;

describe("POST /api/admin/social/targets/publish", () => {
  let db: Db;
  let postId: string;
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  async function addTarget(values: Partial<typeof socialPostTargets.$inferInsert>): Promise<Target> {
    const [t] = await db
      .insert(socialPostTargets)
      .values({ postId, platform: "x", frequency: "once", timeOfDay: "09:00", nextRunAt: nextWeek, status: "scheduled", ...values })
      .returning();
    return t!;
  }
  const reload = async (id: string) => (await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, id)))[0]!;

  beforeEach(async () => {
    db = await getDb();
    const [post] = await db.insert(socialPosts).values({ body: "hello from the test" }).returning();
    postId = post!.id;
    vi.mocked(requireAdmin).mockResolvedValue({ userId: "admin", email: "admin@example.com", role: "admin" } as never);
    vi.mocked(publishTarget).mockResolvedValue({ externalPostId: "ext-1" });
  });

  afterEach(async () => {
    const targets = await db.select({ id: socialPostTargets.id }).from(socialPostTargets).where(eq(socialPostTargets.postId, postId));
    if (targets.length) await db.delete(socialPostTargets).where(inArray(socialPostTargets.id, targets.map((t: { id: string }) => t.id)));
    await db.delete(socialPosts).where(eq(socialPosts.id, postId));
    vi.mocked(requireAdmin).mockReset();
    vi.mocked(publishTarget).mockReset();
  });

  it("refuses anyone but an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    const t = await addTarget({});
    expect((await POST(request({ targetIds: [t.id] }))).status).toBe(403);
    expect(publishTarget).not.toHaveBeenCalled();
  });

  it("refuses bad input", async () => {
    expect((await POST(request({ targetIds: ["not-a-uuid"] }))).status).toBe(400);
    expect((await POST(request({ targetIds: [] }))).status).toBe(400);
  });

  it("publishes a scheduled one-off now, ahead of its time", async () => {
    const t = await addTarget({});
    const res = await POST(request({ targetIds: [t.id] }));
    expect(await res.json()).toEqual({ results: [{ targetId: t.id, ok: true, externalPostId: "ext-1" }] });
    expect(publishTarget).toHaveBeenCalledWith({ platform: "x", body: "hello from the test", imageUrl: null });
    const after = await reload(t.id);
    expect(after.status).toBe("published");
    expect(after.externalPostId).toBe("ext-1");
  });

  it("retries a failed target", async () => {
    const t = await addTarget({ status: "failed", lastError: "old error" });
    await POST(request({ targetIds: [t.id] }));
    expect(await reload(t.id)).toMatchObject({ status: "published", lastError: null });
  });

  it("keeps a recurring schedule where it was", async () => {
    const t = await addTarget({ frequency: "daily" });
    await POST(request({ targetIds: [t.id] }));
    const after = await reload(t.id);
    expect(after.status).toBe("scheduled");
    expect(after.nextRunAt.toISOString()).toBe(t.nextRunAt.toISOString());
  });

  it("won't publish twice", async () => {
    const published = await addTarget({ status: "published" });
    const sending = await addTarget({ status: "sending", platform: "facebook" });
    const res = await POST(request({ targetIds: [published.id, sending.id] }));
    const { results } = (await res.json()) as { results: { ok: boolean }[] };
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(publishTarget).not.toHaveBeenCalled();
  });

  it("records a platform failure on the target", async () => {
    vi.mocked(publishTarget).mockRejectedValue(new Error("X post failed: 403"));
    const t = await addTarget({});
    const res = await POST(request({ targetIds: [t.id] }));
    expect(await res.json()).toEqual({ results: [{ targetId: t.id, ok: false, error: "X post failed: 403" }] });
    expect(await reload(t.id)).toMatchObject({ status: "failed", lastError: "X post failed: 403" });
  });

  it("the scheduler still publishes due targets and advances recurring ones", async () => {
    const due = new Date(Date.now() - 60_000);
    const once = await addTarget({ nextRunAt: due });
    const daily = await addTarget({ nextRunAt: due, frequency: "daily", platform: "facebook" });
    const notDue = await addTarget({ platform: "instagram" });

    const res = await cronPOST(
      new NextRequest("https://example.com/api/cron/social-publish", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      })
    );
    expect(res.status).toBe(200);
    expect((await reload(once.id)).status).toBe("published");
    const d = await reload(daily.id);
    expect(d.status).toBe("scheduled");
    // Next day, same time (computeNextRun keeps the hour and minute, drops seconds).
    const expected = new Date(due);
    expected.setUTCDate(expected.getUTCDate() + 1);
    expected.setUTCSeconds(0, 0);
    expect(d.nextRunAt.toISOString()).toBe(expected.toISOString());
    const untouched = await reload(notDue.id);
    expect(untouched).toMatchObject({ status: "scheduled", externalPostId: null });
  });
});
