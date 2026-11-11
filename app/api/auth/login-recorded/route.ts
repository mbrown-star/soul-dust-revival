import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/auth/session";
import { recordLogin } from "@/lib/auth/recordLogin";
import { BLOCKED_EMAIL_MESSAGE } from "@/lib/auth/blockedMessage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Called by AuthForm right after a sign-in code is verified. The code-based
 * login runs verifyOtp in the browser, so the server never sees the sign-in
 * on its own; without this a brand-new account had a Supabase auth
 * user but no `users` row (and every progress/answer save failed its foreign
 * key). Identity comes only from the verified session cookie -- the request
 * body is ignored.
 */
export async function POST(req: NextRequest) {
  const resolved = await resolveSession();
  if (resolved.status === "signed_out") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A blocked email (/admin/users) that still got a session: end it here and
  // say why. AuthForm also clears every cookie variant via /api/auth/logout.
  if (resolved.status === "blocked") {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("login-recorded: sign-out of a blocked session failed:", err instanceof Error ? err.message : err);
    }
    return NextResponse.json({ error: BLOCKED_EMAIL_MESSAGE, blocked: true }, { status: 403 });
  }
  const { session } = resolved;

  const ok = await recordLogin({
    userId: session.userId,
    email: session.email,
    userAgent: req.headers.get("user-agent"),
  });
  if (!ok) {
    console.error("recordLogin: email already belongs to a different users row", { userId: session.userId });
    return NextResponse.json({ error: "Your account couldn't be set up. Please contact us." }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
