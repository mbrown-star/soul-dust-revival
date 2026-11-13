import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookieDomain, sessionCookieOptions } from "@/lib/domains";

/**
 * Supabase's auth cookies are all named `sb-<project-ref>-...` (the session
 * itself, possibly chunked as `.0`/`.1`, plus the PKCE code verifier).
 */
const SUPABASE_COOKIE_PREFIX = "sb-";

function expireCookie(name: string, domain?: string): string {
  return [`${name}=`, "Path=/", "Max-Age=0", "Secure", "SameSite=Lax", ...(domain ? [`Domain=${domain}`] : [])].join(
    "; "
  );
}

/**
 * Logs the caller out server-side and clears every Supabase auth cookie.
 *
 * Done here rather than with the browser client's signOut() alone because
 * that only deletes the cookie variant matching the *current* cookie options.
 * Since the marketing/app subdomain split moved the session cookie onto the
 * shared parent domain, a browser can still hold an older host-only copy
 * with the same name (from a build where the split wasn't configured). The
 * browser sends both, signOut() deletes only the parent-domain one, and the
 * next page load is still signed in by the leftover copy -- so "Sign out"
 * appeared to do nothing. This route expires every `sb-` cookie it receives
 * in both forms (host-only and parent-domain).
 *
 * Cookies other than Supabase's (e.g. Cloudflare Access's CF_Authorization)
 * are left untouched. POST only: SameSite=Lax means a cross-site form can't
 * send the session cookie here anyway, and a GET logout could be triggered
 * by a prefetch or an <img>.
 */
export async function POST(req: NextRequest) {
  const authCookieNames = req.cookies
    .getAll()
    .map((c) => c.name)
    .filter((name) => name.startsWith(SUPABASE_COOKIE_PREFIX));

  // Revoke the session on Supabase's side too, so a copied refresh token
  // can't be reused. Cookie writes from the client are ignored -- this route
  // clears every variant itself below. A failure here (Supabase down, an
  // already-expired session) must never stop the cookies being cleared.
  if (authCookieNames.length > 0) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookieOptions: sessionCookieOptions(),
          cookies: {
            get: (name: string) => req.cookies.get(name)?.value,
            set: () => {},
            remove: () => {},
          },
        }
      );
      await supabase.auth.signOut();
    } catch (err) {
      console.error("logout: Supabase signOut failed; clearing cookies anyway", err);
    }
  }

  const response = NextResponse.json({ ok: true });
  const domain = cookieDomain();
  for (const name of authCookieNames) {
    response.headers.append("Set-Cookie", expireCookie(name));
    if (domain) response.headers.append("Set-Cookie", expireCookie(name, domain));
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
