import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, type Db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

// getSession wraps Supabase Auth, a genuine external service -- mocked per
// this project's testing convention. Role lookup itself runs against the
// real local Postgres, since that's the actual logic under test.
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/auth/session";
import { requireAdmin, requireLeaderOrAdmin, requireRole } from "./guard";

const mockedGetSession = vi.mocked(getSession);

describe("guard", () => {
  let adminId: string;
  let leaderId: string;
  let userId: string;
  let db: Db;

  beforeEach(async () => {
    db = await getDb();
    // Sequential, not Promise.all -- these all run on the same single
    // node-postgres Client (per getDb()'s per-request-client model), and a
    // plain (non-pooled) Client doesn't support concurrent queries: pg emits
    // a (soon-to-be-hard-error) deprecation warning if you try.
    const [admin] = await db.insert(users).values({ email: `admin-${randomUUID()}@example.com`, role: "admin" }).returning();
    const [leader] = await db.insert(users).values({ email: `leader-${randomUUID()}@example.com`, role: "leader" }).returning();
    const [user] = await db.insert(users).values({ email: `user-${randomUUID()}@example.com`, role: "user" }).returning();
    adminId = admin!.id;
    leaderId = leader!.id;
    userId = user!.id;
  });

  afterEach(async () => {
    // Sequential for the same reason as beforeEach above.
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, leaderId));
    await db.delete(users).where(eq(users.id, userId));
    vi.clearAllMocks();
  });

  it("returns null with no session", async () => {
    mockedGetSession.mockResolvedValue(null);
    expect(await requireRole(["admin"])).toBeNull();
  });

  it("returns null when the session's user no longer exists in the database", async () => {
    mockedGetSession.mockResolvedValue({ userId: randomUUID(), email: "ghost@example.com" });
    expect(await requireRole(["admin"])).toBeNull();
  });

  it("returns null when the user's role is not in the allowed list", async () => {
    mockedGetSession.mockResolvedValue({ userId: userId, email: "user@example.com" });
    expect(await requireRole(["admin", "leader"])).toBeNull();
  });

  it("returns the session with role when the user's role is allowed", async () => {
    mockedGetSession.mockResolvedValue({ userId: adminId, email: "admin@example.com" });
    const result = await requireRole(["admin"]);
    expect(result).toMatchObject({ userId: adminId, role: "admin" });
  });

  describe("requireAdmin", () => {
    it("admits an admin", async () => {
      mockedGetSession.mockResolvedValue({ userId: adminId, email: "admin@example.com" });
      expect(await requireAdmin()).toMatchObject({ role: "admin" });
    });

    it("rejects a leader", async () => {
      mockedGetSession.mockResolvedValue({ userId: leaderId, email: "leader@example.com" });
      expect(await requireAdmin()).toBeNull();
    });

    it("rejects a regular user", async () => {
      mockedGetSession.mockResolvedValue({ userId: userId, email: "user@example.com" });
      expect(await requireAdmin()).toBeNull();
    });
  });

  describe("requireLeaderOrAdmin", () => {
    it("admits an admin", async () => {
      mockedGetSession.mockResolvedValue({ userId: adminId, email: "admin@example.com" });
      expect(await requireLeaderOrAdmin()).toMatchObject({ role: "admin" });
    });

    it("admits a leader", async () => {
      mockedGetSession.mockResolvedValue({ userId: leaderId, email: "leader@example.com" });
      expect(await requireLeaderOrAdmin()).toMatchObject({ role: "leader" });
    });

    it("rejects a regular user", async () => {
      mockedGetSession.mockResolvedValue({ userId: userId, email: "user@example.com" });
      expect(await requireLeaderOrAdmin()).toBeNull();
    });
  });
});
