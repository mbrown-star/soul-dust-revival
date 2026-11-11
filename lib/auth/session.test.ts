import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db/client";
import { blockedEmails } from "@/lib/db/schema";

// Supabase Auth is mocked; the blocked-email lookup runs against the local DB.
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser } }),
}));

const { getSession, resolveSession } = await import("./session");

describe("getSession", () => {
  beforeEach(() => getUser.mockReset());

  it("is null when signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getSession()).toBeNull();
    expect((await resolveSession()).status).toBe("signed_out");
  });

  it("returns the session for an unblocked email", async () => {
    const id = randomUUID();
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
    } finally {
      await db.delete(blockedEmails).where(eq(blockedEmails.email, email));
    }
  });
});
