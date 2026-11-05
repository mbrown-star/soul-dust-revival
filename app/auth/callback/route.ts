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
  const next = searchParams.get("next") ?? "/studies";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);

    if (data.user) {
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
  }

  return NextResponse.redirect(`${origin}${next}`);
}
