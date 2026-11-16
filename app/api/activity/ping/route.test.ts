import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type Db } from "@/lib/db/client";
import { activityVisits, loginEvents, users } from "@/lib/db/schema";
import { asc, eq, inArray } from "drizzle-orm";
import { ACTIVE_PING_CAP_SECONDS } from "@/lib/activity/activeTime";

const getSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSession: () => getSession() }));

const { POST } = await import("./route");

function ping(body?: unknown) {
  return POST(
    new Request("http://localhost/api/activity/ping", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe("POST /api/activity/ping", () => {
  let db: Db;
  let userIds: string[];

  beforeEach(async () => {
    db = await getDb();
    userIds = [];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (userIds.length === 0) return;
    await db.delete(activityVisits).where(inArray(activityVisits.userId, userIds));
    await db.delete(loginEvents).where(inArray(loginEvents.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  });

  async function signInWithLastPing(secondsAgo: number) {
    const userId = randomUUID();
    userIds.push(userId);
    await db.insert(users).values({ id: userId, email: `ping-${userId}@example.com` });
    const [event] = await db
      .insert(loginEvents)
      .values({
        userId,
        loginAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        lastActiveAt: new Date(Date.now() - secondsAgo * 1000),
        activeSeconds: 600,
      })
      .returning();
    getSession.mockResolvedValue({ userId, email: `ping-${userId}@example.com` });
    return event!.id;
  }

  async function activeSecondsOf(id: string) {
    const row = await db.query.loginEvents.findFirst({ where: eq(loginEvents.id, id) });
    return row!;
  }

  it("adds the time since the last ping, while the reader is on the site", async () => {
    const id = await signInWithLastPing(60);
    expect((await ping()).status).toBe(200);
    const row = await activeSecondsOf(id);
    expect(row.activeSeconds).toBeGreaterThanOrEqual(659);
    expect(row.activeSeconds).toBeLessThanOrEqual(662);
    expect(Date.now() - row.lastActiveAt!.getTime()).toBeLessThan(5000);
  });

  // The audit's 945-minute average: days between visits counted as one session.
  it("adds at most two minutes after a long gap, not the days in between", async () => {
    const id = await signInWithLastPing(2 * 24 * 60 * 60);
    await ping();
    expect((await activeSecondsOf(id)).activeSeconds).toBe(600 + ACTIVE_PING_CAP_SECONDS);
  });

  it("refuses a signed-out request and changes nothing", async () => {
    const id = await signInWithLastPing(60);
    getSession.mockResolvedValue(null);
    expect((await ping()).status).toBe(401);
    expect((await activeSecondsOf(id)).activeSeconds).toBe(600);
  });
  async function visitsOf(userId: string) {
    return db.select().from(activityVisits).where(eq(activityVisits.userId, userId)).orderBy(asc(activityVisits.startedAt));
  }

  async function backdateVisits(userId: string, secondsAgo: number) {
    await db
      .update(activityVisits)
      .set({ lastSeenAt: new Date(Date.now() - secondsAgo * 1000) })
      .where(eq(activityVisits.userId, userId));
  }

  it("starts a visit for the page, classed as app or website, without a query string", async () => {
    await signInWithLastPing(30);
    const userId = userIds[0]!;
    expect((await ping({ path: "/library?filter=x", resume: true })).status).toBe(200);
    expect((await ping({ path: "/store" })).status).toBe(200);
    const visits = await visitsOf(userId);
    expect(visits.map((v) => [v.area, v.section, v.path, v.activeSeconds])).toEqual([
      ["app", "library", "/library", 0],
      ["website", "store", "/store", 0],
    ]);
  });

  it("adds the time between pings to the same page's visit", async () => {
    await signInWithLastPing(30);
    const userId = userIds[0]!;
    await ping({ path: "/library", resume: true });
    await backdateVisits(userId, 60);
    await ping({ path: "/library" });
    const [visit] = await visitsOf(userId);
    expect(visit!.activeSeconds).toBeGreaterThanOrEqual(59);
    expect(visit!.activeSeconds).toBeLessThanOrEqual(62);
    expect(await visitsOf(userId)).toHaveLength(1);
  });

  it("doesn't add time away on a resume ping, to the visit or the sign-in", async () => {
    const id = await signInWithLastPing(60);
    const userId = userIds[0]!;
    await ping({ path: "/library", resume: true });
    expect((await activeSecondsOf(id)).activeSeconds).toBe(600);
    await backdateVisits(userId, 90);
    await ping({ path: "/library", resume: true });
    const visits = await visitsOf(userId);
    expect(visits).toHaveLength(1);
    expect(visits[0]!.activeSeconds).toBe(0);
  });

  it("starts a new visit after a long gap on the same page", async () => {
    await signInWithLastPing(30);
    const userId = userIds[0]!;
    await ping({ path: "/blog", resume: true });
    await backdateVisits(userId, 3 * 60 * 60);
    await ping({ path: "/blog" });
    const visits = await visitsOf(userId);
    expect(visits).toHaveLength(2);
    expect(visits.every((v) => v.activeSeconds === 0)).toBe(true);
  });

  it("doesn't log sign-in, auth or API pages, and refuses bad input", async () => {
    await signInWithLastPing(30);
    const userId = userIds[0]!;
    await ping({ path: "/login" });
    await ping({ path: "/auth/callback" });
    expect(await visitsOf(userId)).toHaveLength(0);
    expect((await ping({ path: 42 })).status).toBe(400);
    expect((await ping({ path: "/x", extra: true })).status).toBe(400);
    expect((await ping({ path: "/".repeat(400) })).status).toBe(400);
  });
});
