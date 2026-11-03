import AccountPageClient from "./AccountPageClient";

// Needed for the nonce-based CSP in proxy.ts: nonces require a fresh
// per-request render, which only happens for dynamically-rendered pages.
// Without this, this page would otherwise be statically prerendered at
// build time with no nonce, and its hydration scripts would be blocked by
// the CSP in production. This must live in a Server Component -- route
// segment config exports are silently ignored in a "use client" file,
// which is why the actual page content lives in AccountPageClient instead.
export const dynamic = "force-dynamic";

export default function AccountPage() {
  return <AccountPageClient />;
}
