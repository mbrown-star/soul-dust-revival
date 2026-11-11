import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { blockedEmails, loginEvents, orders, users } from "@/lib/db/schema";
import { listUsersForAdmin } from "@/lib/admin/listUsers";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

// Supabase Auth is a genuine external service — mocked per this project's
// testing convention. The users-table logic underneath is exercised against
// the real local Postgres.
const createUser = vi.fn();
const updateUserById = vi.fn();
const deleteUser = vi.fn();
const listUsers = vi.fn();
// Resend is a genuine external service too.
const sendAccountCreatedEmail = vi.fn();
vi.mock("@/lib/email/send", () => ({ sendAccountCreatedEmail: (...args: unknown[]) => sendAccountCreatedEmail(...args) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseServiceRoleClient: () => ({
    auth: { admin: { createUser, updateUserById, deleteUser, listUsers } },
  }),
}));

const { GET, POST, PUT, PATCH, DELETE } = await import("./route");
const { requireAdmin } = await import("@/lib/admin/guard");

function req(method: string, body?: unknown) {
  return new NextRequest("https://example.com/api/admin/users", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const adminSession = { userId: randomUUID(), email: "admin@example.com", role: "admin" as const };

describe("/api/admin/users", () => {
  const createdIds: string[] = [];
  let db: Db;

  beforeEach(async () => {
    db = await getDb();
    vi.mocked(requireAdmin).mockResolvedValue(adminSession);
    createUser.mockReset();
    updateUserById.mockReset();
    deleteUser.mockReset();
    listUsers.mockReset();
    sendAccountCreatedEmail.mockReset();
    sendAccountCreatedEmail.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    while (createdIds.length) {
      const id = createdIds.pop()!;
      await db.delete(users).where(eq(users.id, id));
    }
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("rejects when not an admin", async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      const res = await GET();
      expect(res.status).toBe(403);
    });
  });

  describe("POST", () => {
    it("rejects when not an admin", async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      const res = await POST(req("POST", { email: "x@example.com", role: "user" }));
      expect(res.status).toBe(403);
      expect(createUser).not.toHaveBeenCalled();
    });

    it("rejects invalid input", async () => {
      const res = await POST(req("POST", { email: "not-an-email", role: "user" }));
      expect(res.status).toBe(400);
      expect(createUser).not.toHaveBeenCalled();
    });

    it("creates the auth user and the app-side row", async () => {
      const authId = randomUUID();
      const email = `new-${authId}@example.com`;
      createUser.mockResolvedValue({ data: { user: { id: authId } }, error: null });

      const res = await POST(req("POST", { email, role: "leader", fullName: "Jamie Rivera", country: "US" }));
      expect(res.status).toBe(201);
      const json = (await res.json()) as { id: string };
      createdIds.push(json.id);

      expect(json).toMatchObject({ id: authId, email, role: "leader", fullName: "Jamie Rivera", country: "US" });
      // Created already confirmed, with no invite link: they sign in with a code.
      expect(createUser).toHaveBeenCalledWith({ email, email_confirm: true });
      expect(sendAccountCreatedEmail).toHaveBeenCalledWith({ to: email, loginUrl: "https://example.com/login" });
      expect(json).toMatchObject({ welcomeEmailSent: true });
    });

    it("keeps the new user and reports it when the welcome email fails", async () => {
      const authId = randomUUID();
      const email = `nomail-${authId}@example.com`;
      createUser.mockResolvedValue({ data: { user: { id: authId } }, error: null });
      sendAccountCreatedEmail.mockRejectedValue(new Error("resend down"));

      const res = await POST(req("POST", { email, role: "user" }));
      expect(res.status).toBe(201);
      const json = (await res.json()) as { id: string; welcomeEmailSent: boolean };
      createdIds.push(json.id);

      expect(json.welcomeEmailSent).toBe(false);
      expect(deleteUser).not.toHaveBeenCalled();
      const rows = await db.select().from(users).where(eq(users.id, authId));
      expect(rows).toHaveLength(1);
    });

    it("surfaces a duplicate email as a 409 rather than a 500", async () => {
      createUser.mockResolvedValue({
        data: { user: null },
        error: { status: 422, message: "A user with this email address has already been registered" },
      });

      const res = await POST(req("POST", { email: "dup@example.com", role: "user" }));
      expect(res.status).toBe(409);
    });

    it("rolls back the auth account if the db insert fails", async () => {
      const authId = randomUUID();
      const email = `race-${authId}@example.com`;
      // Pre-existing row with the same email trips the unique constraint.
      const [existing] = await db.insert(users).values({ email, role: "user" }).returning();
      createdIds.push(existing!.id);

      createUser.mockResolvedValue({ data: { user: { id: authId } }, error: null });

      const res = await POST(req("POST", { email, role: "user" }));
      expect(res.status).toBe(409);
      expect(deleteUser).toHaveBeenCalledWith(authId);
      expect(sendAccountCreatedEmail).not.toHaveBeenCalled();
    });
  });

  describe("PUT", () => {
    it("rejects when not an admin", async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      const res = await PUT(req("PUT", { userId: randomUUID(), fullName: "x" }));
      expect(res.status).toBe(403);
    });

    it("returns 404 for an unknown user", async () => {
      const res = await PUT(req("PUT", { userId: randomUUID(), fullName: "x" }));
      expect(res.status).toBe(404);
    });

    it("updates fullName and country without touching Supabase Auth when email is unchanged", async () => {
      const [u] = await db.insert(users).values({ email: `edit-${randomUUID()}@example.com`, role: "user" }).returning();
      createdIds.push(u!.id);

      const res = await PUT(req("PUT", { userId: u!.id, fullName: "New Name", country: "CA" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toMatchObject({ fullName: "New Name", country: "CA" });
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it("syncs the new email to Supabase Auth before updating the db", async () => {
      const [u] = await db.insert(users).values({ email: `old-${randomUUID()}@example.com`, role: "user" }).returning();
      createdIds.push(u!.id);
      updateUserById.mockResolvedValue({ error: null });

      const newEmail = `new-${randomUUID()}@example.com`;
      const res = await PUT(req("PUT", { userId: u!.id, email: newEmail }));
      expect(res.status).toBe(200);
      expect(updateUserById).toHaveBeenCalledWith(u!.id, { email: newEmail });

      const json = (await res.json()) as { email: string };
      expect(json.email).toBe(newEmail);
    });

    it("does not touch the db if the Supabase Auth email update fails", async () => {
      const originalEmail = `keep-${randomUUID()}@example.com`;
      const [u] = await db.insert(users).values({ email: originalEmail, role: "user" }).returning();
      createdIds.push(u!.id);
      updateUserById.mockResolvedValue({ error: { status: 422, message: "Email already in use" } });

      const res = await PUT(req("PUT", { userId: u!.id, email: "taken@example.com" }));
      expect(res.status).toBe(409);

      const stillThere = await db.query.users.findFirst({ where: eq(users.id, u!.id) });
      expect(stillThere?.email).toBe(originalEmail);
    });

    it("rejects an empty update with no fields", async () => {
      const [u] = await db.insert(users).values({ email: `noop-${randomUUID()}@example.com`, role: "user" }).returning();
      createdIds.push(u!.id);

      const res = await PUT(req("PUT", { userId: u!.id }));
      expect(res.status).toBe(400);
    });
  });

  describe("PATCH (role update, unchanged behavior)", () => {
    it("still rejects an admin changing their own role", async () => {
      const res = await PATCH(req("PATCH", { userId: adminSession.userId, role: "user" }));
      expect(res.status).toBe(400);
    });
  });

  describe("blocked emails", () => {
    const blocked: string[] = [];
    afterEach(async () => {
      while (blocked.length) await db.delete(blockedEmails).where(eq(blockedEmails.email, blocked.pop()!));
    });

    it("POST refuses to create a user with a blocked email, case-insensitively", async () => {
      const email = `blocked-${randomUUID()}@example.com`;
      blocked.push(email);
      await db.insert(blockedEmails).values({ email });

      const res = await POST(req("POST", { email: email.toUpperCase(), role: "user" }));

      expect(res.status).toBe(409);
      expect(((await res.json()) as Record<string, unknown>).error).toBe("email_blocked");
      expect(createUser).not.toHaveBeenCalled();
    });

    it("PUT refuses to change a user's email to a blocked one", async () => {
      const [u] = await db.insert(users).values({ email: `ok-${randomUUID()}@example.com` }).returning();
      createdIds.push(u!.id);
      const email = `blocked-${randomUUID()}@example.com`;
      blocked.push(email);
      await db.insert(blockedEmails).values({ email });

      const res = await PUT(req("PUT", { userId: u!.id, email }));

      expect(res.status).toBe(409);
      expect(updateUserById).not.toHaveBeenCalled();
    });
  });

  describe("DELETE", () => {
    const blocked: string[] = [];
    const orderIds: string[] = [];
    afterEach(async () => {
      while (orderIds.length) await db.delete(orders).where(eq(orders.id, orderIds.pop()!));
      while (blocked.length) await db.delete(blockedEmails).where(eq(blockedEmails.email, blocked.pop()!));
    });

    async function makeUser(role: "admin" | "leader" | "user" = "user") {
      const [u] = await db.insert(users).values({ email: `del-${randomUUID()}@example.com`, role }).returning();
      createdIds.push(u!.id);
      return u!;
    }

    it("rejects when not an admin", async () => {
      vi.mocked(requireAdmin).mockResolvedValue(null);
      const res = await DELETE(req("DELETE", { userId: randomUUID() }));
      expect(res.status).toBe(403);
    });

    it("refuses to delete the calling admin", async () => {
      const res = await DELETE(req("DELETE", { userId: adminSession.userId }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as Record<string, unknown>).error).toBe("cannot_delete_self");
    });

    it("refuses to delete another admin", async () => {
      const target = await makeUser("admin");
      const res = await DELETE(req("DELETE", { userId: target.id }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as Record<string, unknown>).error).toBe("cannot_delete_admin");
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown user", async () => {
      const res = await DELETE(req("DELETE", { userId: randomUUID() }));
      expect(res.status).toBe(404);
    });

    it("removes a user with no orders, their history, and their sign-in account", async () => {
      const target = await makeUser();
      await db.insert(loginEvents).values({ userId: target.id });
      deleteUser.mockResolvedValue({ error: null });

      const res = await DELETE(req("DELETE", { userId: target.id }));

      expect(res.status).toBe(200);
      expect((await res.json()) as Record<string, unknown>).toMatchObject({ usersRow: "removed", blocked: null, authWarning: null });
      expect(await db.query.users.findFirst({ where: eq(users.id, target.id) })).toBeUndefined();
      expect(await db.select().from(loginEvents).where(eq(loginEvents.userId, target.id))).toHaveLength(0);
      expect(deleteUser).toHaveBeenCalledWith(target.id);
      expect(createUser).not.toHaveBeenCalled();
    });

    it("anonymizes a user who has orders, and hides them from the users list", async () => {
      const target = await makeUser();
      const [order] = await db
        .insert(orders)
        .values({ userId: target.id, country: "US", totalCents: 100 })
        .returning();
      orderIds.push(order!.id);
      deleteUser.mockResolvedValue({ error: null });

      const res = await DELETE(req("DELETE", { userId: target.id }));

      expect(res.status).toBe(200);
      expect(((await res.json()) as Record<string, unknown>).usersRow).toBe("anonymized");
      const row = await db.query.users.findFirst({ where: eq(users.id, target.id) });
      expect(row?.email).toBe(`deleted-${target.id}@deleted.invalid`);
      expect((await listUsersForAdmin()).some((u) => u.id === target.id)).toBe(false);
    });

    it("with block: deletes first, then bans a placeholder account for the email", async () => {
      const target = await makeUser();
      blocked.push(target.email);
      deleteUser.mockResolvedValue({ error: null });
      const placeholderId = randomUUID();
      createUser.mockResolvedValue({ data: { user: { id: placeholderId } }, error: null });

      const res = await DELETE(req("DELETE", { userId: target.id, block: true, reason: "spam" }));

      expect(res.status).toBe(200);
      const json = (await res.json()) as Record<string, unknown>;
      expect(json.blocked).toMatchObject({ email: target.email, reason: "spam" });
      // The person's own account is deleted, not merely banned, so their
      // anonymized row can never be signed into again.
      expect(deleteUser).toHaveBeenCalledWith(target.id);
      expect(deleteUser.mock.invocationCallOrder[0]).toBeLessThan(createUser.mock.invocationCallOrder[0]!);
      expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: target.email, ban_duration: "876000h" }));
      const row = await db.query.blockedEmails.findFirst({ where: eq(blockedEmails.email, target.email) });
      expect(row).toMatchObject({ authUserId: placeholderId, authUserIsPlaceholder: true });
    });
  });
});
