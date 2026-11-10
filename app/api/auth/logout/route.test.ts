import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Supabase is a genuine external service -- mock its client; the behavior
// under test is which cookies this route clears.
const signOut = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { signOut } }),
}));

const ORIGINAL_ENV = { ...process.env };

async function loadRoute(env: Partial<NodeJS.ProcessEnv>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return await import("./route");
}

function requestWithCookies(cookie: string) {
  return new NextRequest("https://staging.souldustrevival.com/api/auth/logout", {
    method: "POST",
    headers: { cookie },
  });
}

const COOKIES = "sb-abc-auth-token.0=part0; sb-abc-auth-token.1=part1; sb-abc-auth-token-code-verifier=v; CF_Authorization=keep";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("expires every Supabase cookie both host-only and on the shared parent domain", async () => {
    const { POST } = await loadRoute({ NEXT_PUBLIC_COOKIE_DOMAIN: ".staging.souldustrevival.com" });
    const res = await POST(requestWithCookies(COOKIES));
    const setCookies = res.headers.getSetCookie();

    expect(res.status).toBe(200);
    expect(signOut).toHaveBeenCalledTimes(1);
    for (const name of ["sb-abc-auth-token.0", "sb-abc-auth-token.1", "sb-abc-auth-token-code-verifier"]) {
      const forName = setCookies.filter((c) => c.startsWith(`${name}=;`));
      expect(forName).toHaveLength(2);
      expect(forName.every((c) => c.includes("Max-Age=0"))).toBe(true);
      expect(forName.filter((c) => c.includes("Domain=.staging.souldustrevival.com"))).toHaveLength(1);
      expect(forName.filter((c) => !c.includes("Domain="))).toHaveLength(1);
    }
  });

  it("never touches non-Supabase cookies (e.g. Cloudflare Access)", async () => {
    const { POST } = await loadRoute({ NEXT_PUBLIC_COOKIE_DOMAIN: ".staging.souldustrevival.com" });
    const res = await POST(requestWithCookies(COOKIES));
    expect(res.headers.getSetCookie().some((c) => c.startsWith("CF_Authorization="))).toBe(false);
  });

  it("only clears the host-only form when no cookie domain is configured", async () => {
    const { POST } = await loadRoute({ NEXT_PUBLIC_COOKIE_DOMAIN: "" });
    const res = await POST(requestWithCookies("sb-abc-auth-token=t"));
    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).not.toContain("Domain=");
  });

  it("still clears the cookies when Supabase's signOut throws", async () => {
    signOut.mockRejectedValue(new Error("network down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await loadRoute({ NEXT_PUBLIC_COOKIE_DOMAIN: ".staging.souldustrevival.com" });
    const res = await POST(requestWithCookies("sb-abc-auth-token=t"));
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toHaveLength(2);
  });

  it("does nothing (and skips Supabase) for a visitor with no session cookies", async () => {
    const { POST } = await loadRoute({});
    const res = await POST(requestWithCookies("CF_Authorization=keep"));
    expect(res.status).toBe(200);
    expect(signOut).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
