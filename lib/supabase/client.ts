import { createBrowserClient } from "@supabase/ssr";

/**
 * Client-side Supabase client — use in Client Components
 * (e.g. login/signup forms, auth state listeners).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Asserted explicitly rather than left to @supabase/ssr's library
      // default, which doesn't set Secure at all for the session cookie.
      cookieOptions: { secure: true, sameSite: "lax" },
    }
  );
}
