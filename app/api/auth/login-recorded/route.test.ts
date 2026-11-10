import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const { POST } = await import("./route");
const { getSession } = await import("@/lib/auth/session");

function request() {
  return new NextRequest("https://example.com/api/auth/login-recorded", {
    method: "POST",
    headers: { "user-agent": "vitest" },
  });
}

describe("POST /api/auth/login-recorded", () => {
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

  it("rejects a request with no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(request());
    expect(res.status).toBe(401);
  });

  // REGRESSION: the code-based login (verifyOtp in the browser) never
  // reached /auth/callback, the only place a `users` row was created -- so a
  // brand-new account had no row and every progress/answer save failed.
  it("creates the users row and a login event for a brand-new account", async () => {
    const userId = randomUUID();
    userIds.push(userId);
    vi.mocked(getSession).mockResolvedValue({ userId, email: `new-${userId}@example.com` });

    const res = await POST(request());

    expect(res.status).toBe(200);
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    expect(user?.email).toBe(`new-${userId}@example.com`);
    const events = await db.select().from(loginEvents).where(eq(loginEvents.userId, userId));
    expect(events).toHaveLength(1);
    expect(events[0]?.userAgent).toBe("vitest");
  });

  it("is safe to call again: keeps one users row, adds one login event per sign-in", async () => {
    const userId = randomUUID();
    userIds.push(userId);
    vi.mocked(getSession).mockResolvedValue({ userId, email: `again-${userId}@example.com` });

    await POST(request());
    const res = await POST(request());

    expect(res.status).toBe(200);
    const rows = await db.select().from(users).where(eq(users.id, userId));
    expect(rows).toHaveLength(1);
    const events = await db.select().from(loginEvents).where(eq(loginEvents.userId, userId));
    expect(events).toHaveLength(2);
  });

  it("fails loudly when the email already belongs to a different users row", async () => {
    const email = `taken-${randomUUID()}@example.com`;
    const [existing] = await db.insert(users).values({ email }).returning();
    userIds.push(existing!.id);
    const newId = randomUUID();
    userIds.push(newId);
    vi.mocked(getSession).mockResolvedValue({ userId: newId, email });

    const res = await POST(request());

    expect(res.status).toBe(409);
    expect(await db.query.users.findFirst({ where: eq(users.id, newId) })).toBeUndefined();
    expect(await db.select().from(loginEvents).where(eq(loginEvents.userId, newId))).toHaveLength(0);
  });
});
