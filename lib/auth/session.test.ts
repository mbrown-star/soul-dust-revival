import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { blockedEmails, users } from "@/lib/db/schema";

// Supabase Auth is mocked; the blocked-email lookup and the users-row repair
// run against the local DB.
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

const { getSession, resolveSession } = await import("./session");

const createdUserIds: string[] = [];

async function userRow(id: string) {
  const db = await getDb();
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

describe("getSession", () => {
  beforeEach(() => getUser.mockReset());
  afterEach(async () => {
    if (createdUserIds.length) {
      const db = await getDb();
      await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)));
    }
  });

  it("is null when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getSession()).toBeNull();
    expect((await resolveSession()).status).toBe("signed_out");
  });

  it("returns the session for an unblocked email", async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    getUser.mockResolvedValue({ data: { user: { id, email: `ok-${id}@example.com` } } });
    expect(await getSession()).toEqual({ userId: id, email: `ok-${id}@example.com` });
  });

  it("treats a blocked email's session as signed out, whatever its case", async () => {
    const id = randomUUID();
    const email = `blocked-${id}@example.com`;
    const db = await getDb();
    await db.insert(blockedEmails).values({ email });
    getUser.mockResolvedValue({ data: { user: { id, email: email.toUpperCase() } } });
    try {
      expect(await getSession()).toBeNull();
      expect((await resolveSession()).status).toBe("blocked");
      // A blocked email never gets a users row recreated for it.
      expect(await userRow(id)).toBeUndefined();
    } finally {
      await db.delete(blockedEmails).where(eq(blockedEmails.email, email));
    }
  });

  it("creates the users row for a signed-in account that has none (setup call never arrived)", async () => {
    const id = randomUUID();
    const email = `norow-${id}@example.com`;
    createdUserIds.push(id);
    getUser.mockResolvedValue({ data: { user: { id, email } } });
    expect(await userRow(id)).toBeUndefined();

    expect(await getSession()).toEqual({ userId: id, email });
    const row = await userRow(id);
    expect(row).toMatchObject({ id, email, role: "user" });
  });

  it("leaves an existing users row alone", async () => {
    const id = randomUUID();
    const email = `existing-${id}@example.com`;
    const db = await getDb();
    await db.insert(users).values({ id, email, fullName: "Kept Name", role: "leader", country: "GB" });
    createdUserIds.push(id);
    getUser.mockResolvedValue({ data: { user: { id, email } } });

    await getSession();
    await getSession();
    expect(await userRow(id)).toMatchObject({ fullName: "Kept Name", role: "leader", country: "GB" });
  });

  it("stays signed in, writes nothing and logs (no email) when another row already owns the email", async () => {
    const ownerId = randomUUID();
    const id = randomUUID();
    const email = `taken-${id}@example.com`;
    const db = await getDb();
    await db.insert(users).values({ id: ownerId, email });
    createdUserIds.push(ownerId, id);
    getUser.mockResolvedValue({ data: { user: { id, email } } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await getSession()).toEqual({ userId: id, email });
      expect(await userRow(id)).toBeUndefined();
      expect(logged).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(logged.mock.calls)).not.toContain(email);
    } finally {
      logged.mockRestore();
    }
  });

  it("never writes a row for an account without an email", async () => {
    const id = randomUUID();
    createdUserIds.push(id);
    getUser.mockResolvedValue({ data: { user: { id, email: null } } });
    expect(await getSession()).toEqual({ userId: id, email: "" });
    expect(await userRow(id)).toBeUndefined();
  });
});
