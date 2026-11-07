/**
 * Config for splitting the site across two hostnames: the marketing/
 * storefront domain (home, /books, /blog, checkout) and the app domain
 * (My Library, Study/Devotional readers, Account, Leader Resources).
 * proxy.ts (Next's middleware equivalent) uses this to redirect a request
 * to the right host.
 *
 * All three env vars (the two hostnames plus NEXT_PUBLIC_COOKIE_DOMAIN) are
 * optional and unset in local dev (and any environment that hasn't opted in
 * yet) -- every function here degrades to a no-op single-domain behavior
 * when they're missing, so this is purely additive. lib/env.ts's schema
 * requires all three together (or none) at boot, so a staggered/partial
 * rollout fails loudly there rather than silently breaking cross-subdomain
 * auth here.
 *
 * Lowercased, since a Host header's hostname is always lowercase (the WHATWG
 * URL parser normalizes it) but an operator-typed env var might not be.
 */
const MARKETING_HOSTNAME = process.env.NEXT_PUBLIC_MARKETING_HOSTNAME?.toLowerCase();
const APP_HOSTNAME = process.env.NEXT_PUBLIC_APP_HOSTNAME?.toLowerCase();
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

// Path prefixes that belong on the app subdomain. Checked with startsWith,
// so a prefix covers its whole subtree (e.g. "/studies" covers
// "/studies/[slug]/[lessonId]"). "/leader" is included now even though
// leader resources aren't fully built out yet -- it belongs on the app
// domain once it is. A future new top-level gated route needs adding here
// too -- it isn't derived automatically from the route tree.
const APP_PATH_PREFIXES = ["/library", "/studies", "/account", "/leader"];

// Renders identically regardless of which host served the request -- never
// redirected. Login/signup specifically so a visitor can authenticate
// directly on whichever domain they're already on; the shared cookie domain
// (see sessionCookieOptions() below) means either one authenticates both
// without a cross-domain redirect.
const SHARED_PATH_PREFIXES = ["/login", "/signup", "/auth", "/api"];

/** True when `pathname` is `prefix` itself or inside its subtree. */
export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

/** True once both hostnames are configured -- the split is otherwise inert. */
export function splitEnabled(): boolean {
  return Boolean(MARKETING_HOSTNAME && APP_HOSTNAME);
}

export function appHostname(): string | undefined {
  return APP_HOSTNAME;
}

export function marketingHostname(): string | undefined {
  return MARKETING_HOSTNAME;
}

export function isAppPath(pathname: string): boolean {
  return matchesPrefix(pathname, APP_PATH_PREFIXES);
}

export function isSharedPath(pathname: string): boolean {
  return matchesPrefix(pathname, SHARED_PATH_PREFIXES);
}

/**
 * An absolute link to the marketing domain once the split is configured,
 * otherwise `path` unchanged -- so every call site works the same in an
 * environment that hasn't set the env vars (local dev today).
 */
export function marketingUrl(path: string): string {
  return MARKETING_HOSTNAME ? `https://${MARKETING_HOSTNAME}${path}` : path;
}

/** Same as marketingUrl, but for the app domain. */
export function appUrl(path: string): string {
  return APP_HOSTNAME ? `https://${APP_HOSTNAME}${path}` : path;
}

/**
 * The app domain's own origin (no path), for building a link that must
 * always point at the app regardless of the current request's host --
 * e.g. the order-confirmation email's login link, built from a Stripe
 * webhook request whose own origin is incidental (today, the .workers.dev
 * fallback -- see CLAUDE.md's webhook/Access history). Returns undefined
 * when the split isn't configured, so callers can fall back to their
 * existing behavior.
 */
export function appOrigin(): string | undefined {
  return APP_HOSTNAME ? `https://${APP_HOSTNAME}` : undefined;
}

/**
 * The single source of truth for the Supabase auth cookie's options, used
 * identically by lib/supabase/server.ts, lib/supabase/client.ts, and
 * proxy.ts's own internal client (which refreshes the session cookie on the
 * fly) -- previously each of the three hand-duplicated this object, which
 * only stays correct as long as all three are edited together by hand.
 * `domain` is a leading-dot parent domain (e.g. ".souldustrevival.com") once
 * NEXT_PUBLIC_COOKIE_DOMAIN is configured, sharing the session across the
 * marketing and app subdomains; `undefined` (local dev today) keeps the
 * cookie host-only, unchanged from before the subdomain split existed.
 */
export function sessionCookieOptions() {
  return { secure: true as const, sameSite: "lax" as const, domain: COOKIE_DOMAIN || undefined };
}
