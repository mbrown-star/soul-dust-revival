import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const { POST } = await import("./route");

function cronRequest(secret?: string) {
  return new NextRequest("https://example.com/api/cron/prune-login-events", {
    method: "POST",
    headers: secret ? { Authorization: `Bearer ${secret}` } : {},
  });
}

function monthsAgo(n: number) {
  return new Date(Date.now() - n * 30 * 24 * 60 * 60 * 1000);
}

describe("POST /api/cron/prune-login-events", () => {
  let userId: string;
  let db: Db;

  beforeEach(async () => {
    db = await getDb();
    const [user] = await db.insert(users).values({ email: `test-${randomUUID()}@example.com`, role: "user" }).returning();
    userId = user!.id;
  });

  afterEach(async () => {
    await db.delete(loginEvents).where(eq(loginEvents.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("rejects requests without the correct CRON_SECRET", async () => {
    expect((await POST(cronRequest())).status).toBe(403);
    expect((await POST(cronRequest("wrong-secret"))).status).toBe(403);
  });

  it("deletes only login_events older than the retention window", async () => {
    await db.insert(loginEvents).values([
      { userId, loginAt: monthsAgo(20), userAgent: "old-20mo" },
      { userId, loginAt: monthsAgo(14), userAgent: "old-14mo" },
      { userId, loginAt: monthsAgo(10), userAgent: "recent-10mo" },
      { userId, loginAt: monthsAgo(1), userAgent: "recent-1mo" },
    ]);

    const res = await POST(cronRequest(process.env.CRON_SECRET));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deleted: number };
    expect(body.deleted).toBe(2);

    const remaining = await db.select().from(loginEvents).where(eq(loginEvents.userId, userId));
    expect(remaining.map((r: typeof loginEvents.$inferSelect) => r.userAgent).sort()).toEqual([
      "recent-10mo",
      "recent-1mo",
    ]);
  });
});
