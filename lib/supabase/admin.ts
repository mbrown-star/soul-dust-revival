import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and can perform admin operations like
 * deleting an auth user outright. Used in exactly one place: the
 * self-service account deletion flow (app/api/account/delete/route.ts),
 * since removing someone's ability to log in requires the Admin API, which
 * the anon-key client used everywhere else in the app can't do.
 *
 * Never import this into anything client-facing — SUPABASE_SERVICE_ROLE_KEY
 * must never reach the browser.
 */
export function createSupabaseServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
