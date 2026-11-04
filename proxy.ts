import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Same R2-hostname derivation as next.config.js's image remotePatterns, so
// the CSP's img-src/media-src stay in sync with whatever R2_PUBLIC_BASE_URL
// is actually configured, instead of a hardcoded or wildcarded domain.
function getR2Hostname() {
  try {
    return new URL(process.env.R2_PUBLIC_BASE_URL!).hostname;
  } catch {
    return "example-not-configured.r2.dev";
  }
}

// Nonce-based CSP (see SECURITY.md). Requires every page to be dynamically
// rendered to get a fresh nonce per request -- this app already is, except
// /account, which has `export const dynamic = "force-dynamic"` for exactly
// this reason.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const r2Host = getR2Hostname();

  // Supabase Auth (browser client), direct-to-R2 presigned uploads, and
  // Cloudflare Stream (direct creator upload + signed HLS playback) are all
  // per-account/per-project subdomains, not a single hardcodable host --
  // wildcarded accordingly. Stripe checkout is a full top-level redirect
  // (`window.location.href` to a Stripe-hosted page), not an embedded
  // fetch/frame, so it needs no CSP allowance here.
  //
  // style-src intentionally has no nonce: this app uses inline `style={{}}`
  // props in several places (e.g. the homepage's animated dust motes), and
  // per the CSP spec a nonce on style-src applies only to <style> elements,
  // never to style="" attributes -- once a nonce is present, 'unsafe-inline'
  // is also ignored for the whole directive in nonce-aware browsers, so a
  // nonce there would silently break every inline style with no fallback.
  // script-src keeps the strict nonce, which is where it matters for XSS.
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https://${r2Host};
    media-src 'self' https://${r2Host} https://*.cloudflarestream.com;
    font-src 'self';
    connect-src 'self' https://*.supabase.co https://*.r2.cloudflarestorage.com https://api.cloudflare.com https://upload.videodelivery.net https://*.cloudflarestream.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  // Supabase's access token is short-lived; @supabase/ssr refreshes it using
  // the refresh token whenever a server-side `getUser()` call sees it's
  // expired. That refresh has to land somewhere Next.js allows a Set-Cookie
  // header to be written -- a Server Action, a Route Handler, or (this)
  // proxy/middleware -- not an ordinary Server Component render. Without
  // this, any Server Component calling getUser() (e.g. SiteHeader, on every
  // marketing page) throws "Cookies can only be modified in a Server Action
  // or Route Handler" as soon as the access token needs refreshing, and the
  // session silently fails to persist across requests.
  //
  // Collected into `pendingCookies` and applied once at the end, rather than
  // building a fresh NextResponse inside each set/remove call -- a session
  // refresh can write more than one cookie (e.g. a split/chunked auth
  // cookie), and replacing the whole response object on every call would
  // silently drop every cookie but the last.
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: true, sameSite: "lax" },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          pendingCookies.push({ name, value, options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          pendingCookies.push({ name, value: "", options });
        },
      },
    }
  );

  await supabase.auth.getUser();

  // Built once, after the refresh, so it carries both the up-to-date
  // request headers (nonce/CSP, and any cookies Supabase just rewrote onto
  // `request`) and every pending Set-Cookie for the browser.
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const cookie of pendingCookies) {
    response.cookies.set({ name: cookie.name, value: cookie.value, ...cookie.options });
  }

  response.headers.set("Content-Security-Policy", cspHeader);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
