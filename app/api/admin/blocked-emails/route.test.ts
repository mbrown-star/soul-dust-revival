import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { blockedEmails, users } from "@/lib/db/schema";
import { isEmailBlocked } from "@/lib/auth/blockedEmails";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

// Supabase Auth is a genuine external service, mocked per this project's
// testing convention; the blocked_emails logic runs against the local DB.
const createUser = vi.fn();
const updateUserById = vi.fn();
const deleteUser = vi.fn();
const listUsers = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseServiceRoleClient: () => ({
    auth: { admin: { createUser, updateUserById, deleteUser, listUsers } },
  }),
}));

const { GET, POST, DELETE } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

const adminSession = { userId: randomUUID(), email: "admin@example.com", role: "admin" as const };

function req(method: string, body?: unknown) {
  return new NextRequest("https://example.com/api/admin/blocked-emails", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("/api/admin/blocked-emails", () => {
  let db: Db;
  const emails: string[] = [];
  const userIds: string[] = [];

  function freshEmail() {
    const email = `blk-${randomUUID()}@example.com`;
    emails.push(email);
    return email;
  }

  beforeEach(async () => {
    db = await getDb();
    vi.mocked(requireAdmin).mockResolvedValue(adminSession);
    for (const fn of [createUser, updateUserById, deleteUser, listUsers]) fn.mockReset();
  });

  afterEach(async () => {
    if (emails.length) await db.delete(blockedEmails).where(inArray(blockedEmails.email, emails.splice(0)));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds.splice(0)));
  });

  it("rejects every method when not an admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);
    expect((await GET()).status).toBe(403);
    expect((await POST(req("POST", { email: "x@example.com" }))).status).toBe(403);
    expect((await DELETE(req("DELETE", { id: randomUUID() }))).status).toBe(403);
  });

  it("rejects invalid input", async () => {
    expect((await POST(req("POST", { email: "not-an-email" }))).status).toBe(400);
    expect((await POST(req("POST", { email: "a@example.com", extra: 1 }))).status).toBe(400);
    expect((await DELETE(req("DELETE", { id: "nope" }))).status).toBe(400);
  });

  it("blocks an email with no account by banning a new placeholder account, stored lowercased", async () => {
    const email = freshEmail();
    const placeholderId = randomUUID();
    createUser.mockResolvedValue({ data: { user: { id: placeholderId } }, error: null });

    const res = await POST(req("POST", { email: email.toUpperCase(), reason: " spam " }));

    expect(res.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith({ email, email_confirm: true, ban_duration: "876000h" });
    const row = await db.query.blockedEmails.findFirst({ where: eq(blockedEmails.email, email) });
    expect(row).toMatchObject({ reason: "spam", authUserId: placeholderId, authUserIsPlaceholder: true });
    expect(await isEmailBlocked(email.toUpperCase())).toBe(true);
  });

  it("blocks an existing user's email by banning their own account and keeping their data", async () => {
    const email = freshEmail();
    const [u] = await db.insert(users).values({ email }).returning();
    userIds.push(u!.id);
    updateUserById.mockResolvedValue({ error: null });

    const res = await POST(req("POST", { email }));

    expect(res.status).toBe(201);
    expect(updateUserById).toHaveBeenCalledWith(u!.id, { ban_duration: "876000h" });
    expect(createUser).not.toHaveBeenCalled();
    expect(await db.query.users.findFirst({ where: eq(users.id, u!.id) })).toBeDefined();
    const row = await db.query.blockedEmails.findFirst({ where: eq(blockedEmails.email, email) });
    expect(row).toMatchObject({ authUserId: u!.id, authUserIsPlaceholder: false });
  });

  it("finds and bans an auth account that has no users row", async () => {
    const email = freshEmail();
    const authId = randomUUID();
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 422, message: "email_exists" } });
    listUsers.mockResolvedValue({ data: { users: [{ id: authId, email: email.toUpperCase() }] }, error: null });
    updateUserById.mockResolvedValue({ error: null });

    await POST(req("POST", { email }));

    expect(updateUserById).toHaveBeenCalledWith(authId, { ban_duration: "876000h" });
    const row = await db.query.blockedEmails.findFirst({ where: eq(blockedEmails.email, email) });
    expect(row).toMatchObject({ authUserId: authId, authUserIsPlaceholder: false });
  });

  it("still blocks in the app, with a warning, when the Supabase ban fails", async () => {
    const email = freshEmail();
    createUser.mockResolvedValue({ data: { user: null }, error: { status: 500, message: "down" } });

    const res = await POST(req("POST", { email }));

    expect(res.status).toBe(201);
    expect(((await res.json()) as Record<string, unknown>).authWarning).toMatch(/sign-in ban failed/);
    expect(await isEmailBlocked(email)).toBe(true);
  });

  it("is idempotent", async () => {
    const email = freshEmail();
    createUser.mockResolvedValue({ data: { user: { id: randomUUID() } }, error: null });
    await POST(req("POST", { email }));

    const res = await POST(req("POST", { email }));

    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).alreadyBlocked).toBe(true);
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it("refuses the caller's own email and an admin's email", async () => {
    const own = await POST(req("POST", { email: adminSession.email.toUpperCase() }));
    expect(own.status).toBe(400);

    const email = freshEmail();
    const [admin] = await db.insert(users).values({ email, role: "admin" }).returning();
    userIds.push(admin!.id);
    const other = await POST(req("POST", { email }));
    expect(other.status).toBe(400);
    expect(((await other.json()) as Record<string, unknown>).error).toBe("cannot_block_admin");
    expect(await isEmailBlocked(email)).toBe(false);
  });

  it("lists blocked emails", async () => {
    const email = freshEmail();
    await db.insert(blockedEmails).values({ email, reason: "r" });
    const list = (await (await GET()).json()) as { email: string }[];
    expect(list.some((b) => b.email === email)).toBe(true);
  });

  describe("DELETE (unblock)", () => {
    it("deletes a placeholder account, then the row", async () => {
      const email = freshEmail();
      const authId = randomUUID();
      const [row] = await db
        .insert(blockedEmails)
        .values({ email, authUserId: authId, authUserIsPlaceholder: true })
        .returning();
      deleteUser.mockResolvedValue({ error: null });

      const res = await DELETE(req("DELETE", { id: row!.id }));

      expect(res.status).toBe(200);
      expect(deleteUser).toHaveBeenCalledWith(authId);
      expect(await isEmailBlocked(email)).toBe(false);
    });

    it("lifts the ban on the person's own account", async () => {
      const email = freshEmail();
      const authId = randomUUID();
      const [row] = await db.insert(blockedEmails).values({ email, authUserId: authId }).returning();
      updateUserById.mockResolvedValue({ error: null });

      await DELETE(req("DELETE", { id: row!.id }));

      expect(updateUserById).toHaveBeenCalledWith(authId, { ban_duration: "none" });
      expect(deleteUser).not.toHaveBeenCalled();
      expect(await isEmailBlocked(email)).toBe(false);
    });

    it("keeps the block when Supabase refuses, so the ban and the row stay in step", async () => {
      const email = freshEmail();
      const [row] = await db
        .insert(blockedEmails)
        .values({ email, authUserId: randomUUID(), authUserIsPlaceholder: true })
        .returning();
      deleteUser.mockResolvedValue({ error: { status: 500, message: "down" } });

      const res = await DELETE(req("DELETE", { id: row!.id }));

      expect(res.status).toBe(502);
      expect(await isEmailBlocked(email)).toBe(true);
    });

    it("treats an already-gone auth account as unblocked", async () => {
      const email = freshEmail();
      const [row] = await db
        .insert(blockedEmails)
        .values({ email, authUserId: randomUUID(), authUserIsPlaceholder: true })
        .returning();
      deleteUser.mockResolvedValue({ error: { status: 404, message: "not found" } });

      expect((await DELETE(req("DELETE", { id: row!.id }))).status).toBe(200);
      expect(await isEmailBlocked(email)).toBe(false);
    });

    it("returns 404 for an unknown id", async () => {
      expect((await DELETE(req("DELETE", { id: randomUUID() }))).status).toBe(404);
    });
  });
});
