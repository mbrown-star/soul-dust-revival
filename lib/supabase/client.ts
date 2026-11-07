import { createBrowserClient } from "@supabase/ssr";
import { sessionCookieOptions } from "@/lib/domains";

/**
 * Client-side Supabase client — use in Client Components
 * (e.g. login/signup forms, auth state listeners).
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // sessionCookieOptions() -- see lib/supabase/server.ts's matching
      // comment; the single source of truth shared by both Supabase clients
      // and proxy.ts's own internal one.
      cookieOptions: sessionCookieOptions(),
    }
  );
}
