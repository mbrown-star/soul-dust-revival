import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn() }));

// Supabase Auth is a genuine external service — mocked per this project's
// testing convention. The users-table logic underneath is exercised against
// the real local Postgres.
const inviteUserByEmail = vi.fn();
const updateUserById = vi.fn();
const deleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseServiceRoleClient: () => ({
    auth: { admin: { inviteUserByEmail, updateUserById, deleteUser } },
  }),
}));

const { GET, POST, PUT, PATCH } = await import("./route");
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

  beforeEach(() => {
    vi.mocked(requireAdmin).mockResolvedValue(adminSession);
    inviteUserByEmail.mockReset();
    updateUserById.mockReset();
    deleteUser.mockReset();
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
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it("rejects invalid input", async () => {
      const res = await POST(req("POST", { email: "not-an-email", role: "user" }));
      expect(res.status).toBe(400);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it("creates the auth user and the app-side row", async () => {
      const authId = randomUUID();
      const email = `new-${authId}@example.com`;
      inviteUserByEmail.mockResolvedValue({ data: { user: { id: authId } }, error: null });

      const res = await POST(req("POST", { email, role: "leader", fullName: "Jamie Rivera", country: "US" }));
      expect(res.status).toBe(201);
      const json = await res.json();
      createdIds.push(json.id);

      expect(json).toMatchObject({ id: authId, email, role: "leader", fullName: "Jamie Rivera", country: "US" });
      expect(inviteUserByEmail).toHaveBeenCalledWith(email, expect.objectContaining({ redirectTo: expect.any(String) }));
    });

    it("surfaces a duplicate-email invite as a 409 rather than a 500", async () => {
      inviteUserByEmail.mockResolvedValue({
        data: { user: null },
        error: { status: 422, message: "User already registered" },
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

      inviteUserByEmail.mockResolvedValue({ data: { user: { id: authId } }, error: null });

      const res = await POST(req("POST", { email, role: "user" }));
      expect(res.status).toBe(409);
      expect(deleteUser).toHaveBeenCalledWith(authId);
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

      const json = await res.json();
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
});
