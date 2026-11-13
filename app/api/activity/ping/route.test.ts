import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb, type Db } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { ACTIVE_PING_CAP_SECONDS } from "@/lib/activity/activeTime";

const getSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSession: () => getSession() }));

const { POST } = await import("./route");

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
    expect((await POST()).status).toBe(200);
    const row = await activeSecondsOf(id);
    expect(row.activeSeconds).toBeGreaterThanOrEqual(659);
    expect(row.activeSeconds).toBeLessThanOrEqual(662);
    expect(Date.now() - row.lastActiveAt!.getTime()).toBeLessThan(5000);
  });

  // The audit's 945-minute average: days between visits counted as one session.
  it("adds at most two minutes after a long gap, not the days in between", async () => {
    const id = await signInWithLastPing(2 * 24 * 60 * 60);
    await POST();
    expect((await activeSecondsOf(id)).activeSeconds).toBe(600 + ACTIVE_PING_CAP_SECONDS);
  });

  it("refuses a signed-out request and changes nothing", async () => {
    const id = await signInWithLastPing(60);
    getSession.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect((await activeSecondsOf(id)).activeSeconds).toBe(600);
  });
});
