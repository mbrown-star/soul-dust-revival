import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailBlocked } from "@/lib/auth/blockedEmails";

export type Session = {
  userId: string;
  email: string;
};

export type SessionResolution =
  | { status: "signed_in"; session: Session }
  | { status: "blocked"; session: Session }
  | { status: "signed_out" };

/**
 * The Supabase session, plus whether its email has been blocked
 * (/admin/users). Only the sign-in route needs to tell "blocked" from
 * "signed out" (to say why); everything else uses getSession().
 */
export async function resolveSession(): Promise<SessionResolution> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "signed_out" };

  const session = { userId: user.id, email: user.email ?? "" };
  if (await isEmailBlocked(session.email)) return { status: "blocked", session };
  return { status: "signed_in", session };
}

/**
 * Real session lookup via Supabase Auth. Works in Server Components,
 * Route Handlers, and Server Actions (relies on cookies()).
 *
 * A blocked email's session counts as signed out, so it reaches no gated
 * page or route even if it was issued before the block. See
 * lib/auth/blockedEmails.ts.
 */
export async function getSession(): Promise<Session | null> {
  const resolved = await resolveSession();
  return resolved.status === "signed_in" ? resolved.session : null;
}
