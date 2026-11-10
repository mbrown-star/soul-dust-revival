import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordLogin } from "@/lib/auth/recordLogin";

/**
 * Handles the redirect from Supabase's magic-link email.
 * Exchanges the code for a session, then makes sure a row exists
 * in our own `users` table (keyed by the same Supabase auth UID),
 * and records a login event for access reporting.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/library";

  // REAL BUG FOUND (2026-11-08, later): the fix above only covers a `code`
  // that's present but fails to exchange. When Supabase's own /verify step
  // fails BEFORE ever issuing a code -- most commonly `otp_expired`, the
  // same prefetch/already-used scenario described above -- GoTrue redirects
  // here with no `code` param at all, just `error`/`error_code`/
  // `error_description`. With no `code`, the `if (code)` block below was
  // skipped entirely and execution fell straight through to the final
  // `redirect(origin + next)`, silently sending the visitor to e.g.
  // `/library` as if login had succeeded. That then bounced through the
  // marketing/app subdomain split (since `/library` is an app path) and
  // landed on the app domain's own unauthenticated `/login` -- the same
  // "silently lands back on login" failure mode the fix above was meant to
  // close, just reached through GoTrue's other failure path. Confirmed live
  // by tracing a real expired magic-link verify URL and watching it redirect
  // here with `error_code=otp_expired` and no `code`.
  if (!code && searchParams.has("error")) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("next", next);
    loginUrl.searchParams.set("error", "link_expired");
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    // REAL BUG FOUND (2026-11-08, reported live as "magic-link opens back to
    // login page"): this used to ignore `error` entirely and always redirect
    // to `next` regardless of whether the exchange actually succeeded. A
    // magic-link code is single-use, and email clients/corporate security
    // scanners commonly pre-fetch every link in an email (Outlook Safe
    // Links and similar) before the person ever clicks -- consuming the
    // code, so the real click then fails with an "already used"/expired
    // error from Supabase. With no session ever set, redirecting to `next`
    // (e.g. /library) anyway just handed the visitor to that page's own
    // session guard, which bounced them to /login -- "it opened, then
    // silently went back to the login page," with no explanation of why.
    // Now a failed exchange redirects to /login with a visible reason and
    // the original `next` preserved, so requesting a fresh link still lands
    // the visitor where they meant to go.
    if (error || !data.user) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("next", next);
      loginUrl.searchParams.set("error", "link_expired");
      return NextResponse.redirect(loginUrl);
    }

    const recorded = await recordLogin({
      userId: data.user.id,
      email: data.user.email ?? "",
      userAgent: req.headers.get("user-agent"),
    });
    // The email already belongs to a different `users` row -- same case
    // /api/auth/login-recorded answers with a 409. Say so rather than
    // redirecting into a reader that can't save anything for this account.
    if (!recorded) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("next", next);
      loginUrl.searchParams.set("error", "account_setup");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
