import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";

// Supabase Auth's admin API is mocked; the data deletion runs against the local DB.
const deleteUser = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseServiceRoleClient: () => ({ auth: { admin: { deleteUser } } }),
}));

const { deleteAccount } = await import("./deleteAccount");

async function userRow(id: string) {
  const db = await getDb();
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

describe("deleteAccount", () => {
  afterEach(() => deleteUser.mockReset());

  it("removes the row and the login", async () => {
    const id = randomUUID();
    const db = await getDb();
    await db.insert(users).values({ id, email: `del-${id}@example.com` });
    await db.insert(loginEvents).values({ userId: id });
    deleteUser.mockResolvedValue({ error: null });

    expect(await deleteAccount(id)).toEqual({ usersRow: "removed", authDeleted: true });
    expect(await userRow(id)).toBeUndefined();
    expect(deleteUser).toHaveBeenCalledWith(id);
  });

  it("clears a row that a request still in flight recreated before the login was deleted", async () => {
    const id = randomUUID();
    const email = `race-${id}@example.com`;
    const db = await getDb();
    await db.insert(users).values({ id, email });
    // While Supabase deletes the login, a request from the same account (its
    // session still valid until now) recreates the row and logs activity,
    // as lib/auth/session.ts's self-repair would.
    deleteUser.mockImplementation(async () => {
      await db.insert(users).values({ id, email });
      await db.insert(loginEvents).values({ userId: id });
      return { error: null };
    });

    expect(await deleteAccount(id)).toEqual({ usersRow: "removed", authDeleted: true });
    expect(await userRow(id)).toBeUndefined();
    expect(await db.query.loginEvents.findFirst({ where: eq(loginEvents.userId, id) })).toBeUndefined();
  });

  it("doesn't clear again when the login couldn't be deleted", async () => {
    const id = randomUUID();
    const email = `fail-${id}@example.com`;
    const db = await getDb();
    await db.insert(users).values({ id, email });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    deleteUser.mockImplementation(async () => {
      await db.insert(users).values({ id, email });
      return { error: { status: 500, message: "boom" } };
    });
    try {
      expect(await deleteAccount(id)).toEqual({ usersRow: "removed", authDeleted: false });
      // The login still works, so its row stays usable rather than being torn out from under it.
      expect(await userRow(id)).toMatchObject({ id, email });
    } finally {
      logged.mockRestore();
      await db.delete(users).where(eq(users.id, id));
    }
  });
});
