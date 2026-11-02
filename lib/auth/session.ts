import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Session = {
  userId: string;
  email: string;
};

/**
 * Real session lookup via Supabase Auth. Works in Server Components,
 * Route Handlers, and Server Actions (relies on cookies()).
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return { userId: user.id, email: user.email ?? "" };
}
