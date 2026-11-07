import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "@/lib/domains";

/**
 * Server-side Supabase client — use in Server Components, Route Handlers,
 * and Server Actions. Reads/writes the auth cookie via Next's cookies().
 *
 * Next.js 15 made cookies() async (it returns a Promise), so this factory
 * must be awaited by every caller — a synchronous version here would compile
 * under a loose tsconfig but throw at runtime.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // sessionCookieOptions() -- the single source of truth also used by
      // lib/supabase/client.ts and proxy.ts's own internal client, so the
      // three can't drift out of sync with each other. See its doc comment
      // in lib/domains.ts for what `secure`/`sameSite`/`domain` do here.
      cookieOptions: sessionCookieOptions(),
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: "", ...options });
        },
      },
    }
  );
}
