"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseSessionTokensFromHash } from "@/lib/auth/sessionHashTokens";

/**
 * Supabase Auth normally completes a magic-link login via the PKCE flow
 * (a `?code=` query param that `/auth/callback/route.ts` exchanges for a
 * session). Found live (2026-11-16): when Supabase's own `redirect_to`
 * validation rejects the requested destination for a reason outside this
 * app's control, GoTrue falls back to the older "implicit" flow instead --
 * delivering the session directly as `#access_token=...&refresh_token=...`
 * in the URL fragment of the (now-wrong) fallback Site URL, rather than
 * erroring. A URL fragment never reaches the server, so no amount of
 * server-side code can catch this -- it has to be handled client-side,
 * wherever it happens to land.
 *
 * This renders nothing; it only watches for that fragment shape on mount
 * (both a cold `/` load, where the broken redirect is expected to land it,
 * and after client-side navigation, since Next's router doesn't do a full
 * reload) and completes the login using the exact same browser client the
 * rest of the app's auth code already uses -- not a one-off workaround, the
 * real client factory, so the resulting cookie is identical either way.
 */
export function SessionHashRecovery() {
  const router = useRouter();

  useEffect(() => {
    const tokens = parseSessionTokensFromHash(window.location.hash);
    if (!tokens) return;

    const supabase = createSupabaseBrowserClient();

    supabase.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken }).then(({ error }) => {
      // Strip the tokens from the address bar either way -- they're
      // single-use and shouldn't linger in the URL (history, referrers,
      // accidental screenshots) regardless of whether this succeeded.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      if (error) {
        console.error("Session recovery from URL fragment failed:", error.message);
        return;
      }

      // Re-render server components with the now-set session cookie (e.g.
      // the nav bar's logged-in state) without a full page reload.
      router.refresh();
    });
  }, [router]);

  return null;
}
