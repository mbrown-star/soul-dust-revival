import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getDb, type Db } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Supabase is a genuine external service -- mocked here, same convention as
// the rest of this project's tests (e.g. webhook-handlers.test.ts mocking
// Resend). exchangeCodeForSession's return value is set per test.
const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    auth: { exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSession(...args) },
  }),
}));

const { GET } = await import("./route");

function callbackRequest(params: Record<string, string>) {
  const url = new URL("https://app.example.com/auth/callback");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

describe("GET /auth/callback", () => {
  let db: Db;
  let createdUserId: string | undefined;

  beforeEach(async () => {
    db = await getDb();
    vi.clearAllMocks();
    createdUserId = undefined;
  });

  afterEach(async () => {
    if (createdUserId) {
      await db.delete(loginEvents).where(eq(loginEvents.userId, createdUserId));
      await db.delete(users).where(eq(users.id, createdUserId));
    }
  });

  it("with no code, redirects straight to next unchanged", async () => {
    const res = await GET(callbackRequest({ next: "/library" }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://app.example.com/library");
  });

  it("on a successful exchange, creates the user/login-event rows and redirects to next", async () => {
    createdUserId = randomUUID();
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: createdUserId, email: "real@example.com" } },
      error: null,
    });

    const res = await GET(callbackRequest({ code: "good-code", next: "/library" }));

    expect(res.headers.get("location")).toBe("https://app.example.com/library");
    const user = await db.query.users.findFirst({ where: eq(users.id, createdUserId) });
    expect(user?.email).toBe("real@example.com");
    const events = await db.select().from(loginEvents).where(eq(loginEvents.userId, createdUserId));
    expect(events).toHaveLength(1);
  });

  // REGRESSION (reported live 2026-11-08 as "magic-link opens back to login
  // page"): a failed exchange used to be silently ignored and the response
  // redirected to `next` anyway, as if login had succeeded -- `next` (e.g.
  // /library) would then bounce an unauthenticated visitor straight back to
  // /login via its own session guard, with no indication of what went wrong.
  it("on a failed exchange (expired/already-used code), redirects to /login with a visible reason instead of next", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: null },
      error: { message: "Token has expired or is invalid" },
    });

    const res = await GET(callbackRequest({ code: "stale-code", next: "/library" }));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/library");
    expect(location.searchParams.get("error")).toBe("link_expired");
  });

  it("treats a missing user with no error the same as a failed exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: null });

    const res = await GET(callbackRequest({ code: "weird-code", next: "/library" }));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("link_expired");
  });

  // REGRESSION (found live 2026-11-08, traced against a real expired
  // magic-link verify URL): when Supabase's /verify step itself fails --
  // most commonly `otp_expired`, an already-used/expired link -- GoTrue
  // redirects here with no `code` param at all, just `error`/`error_code`/
  // `error_description`. The `if (code)` block above never ran in this
  // case, so it fell through to the unconditional redirect(next) -- the
  // exact "silently lands back on login" bug the fix two tests up was
  // supposed to close, just reached through GoTrue's other failure path.
  it("with a GoTrue-level error and no code, redirects to /login with a visible reason instead of next", async () => {
    const res = await GET(
      callbackRequest({
        error: "access_denied",
        error_code: "otp_expired",
        error_description: "Email link is invalid or has expired",
        next: "/library",
      })
    );

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/library");
    expect(location.searchParams.get("error")).toBe("link_expired");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("when the email already belongs to a different users row, sends the visitor to /login with a reason", async () => {
    const email = `taken-${randomUUID()}@example.com`;
    const [existing] = await db.insert(users).values({ email }).returning();
    createdUserId = existing!.id;
    const newId = randomUUID();
    exchangeCodeForSession.mockResolvedValue({ data: { user: { id: newId, email } }, error: null });

    const res = await GET(callbackRequest({ code: "good-code", next: "/library" }));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("account_setup");
    expect(await db.select().from(loginEvents).where(eq(loginEvents.userId, newId))).toHaveLength(0);
  });

  // Scoped to one user id rather than comparing the whole login_events
  // table's size, which other test files write to in parallel. An error
  // alongside a user object must still write nothing for that user.
  it("does not write any user/login-event rows when the exchange fails", async () => {
    const userId = randomUUID();
    createdUserId = userId;
    exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: userId, email: "stale@example.com" } },
      error: { message: "Token has expired or is invalid" },
    });

    await GET(callbackRequest({ code: "stale-code", next: "/library" }));

    expect(await db.query.users.findFirst({ where: eq(users.id, userId) })).toBeUndefined();
    expect(await db.select().from(loginEvents).where(eq(loginEvents.userId, userId))).toHaveLength(0);
  });
});
