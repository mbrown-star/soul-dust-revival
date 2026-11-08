import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { users, loginEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    const db = await getDb();
    const existing = await db.query.users.findFirst({ where: eq(users.id, data.user.id) });
    if (!existing) {
      await db.insert(users).values({
        id: data.user.id, // reuse Supabase's UID as our primary key
        email: data.user.email ?? "",
      });
    }

    // One row per login — the basis for the admin "how often" access
    // report. lastActiveAt starts equal to loginAt and is nudged forward
    // by a heartbeat while the user has an authenticated page open
    // (see components/study/ActivityHeartbeat.tsx).
    await db.insert(loginEvents).values({
      userId: data.user.id,
      userAgent: req.headers.get("user-agent"),
    });
  }

  return NextResponse.redirect(`${origin}${next}`);
}
