import { marketingUrl } from "@/lib/domains";

/** How long to wait for the logout request before reloading anyway. */
const LOGOUT_TIMEOUT_MS = 8000;

/**
 * Shared "Log out" action for every logout button (site nav, admin nav,
 * account deletion). Clears the session server-side (see
 * app/api/auth/logout/route.ts for why the browser client alone isn't
 * enough), then always does a full page load of the marketing homepage --
 * even if the request failed or timed out -- so the button can never be
 * left stuck on "Logging out..." and every bit of server-rendered UI
 * re-renders from the cleared cookies rather than a client-side refresh.
 */
export async function logOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(LOGOUT_TIMEOUT_MS),
    });
  } catch {
    // Fall through to the reload regardless.
  }
  window.location.assign(marketingUrl("/"));
}
