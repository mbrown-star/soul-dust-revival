import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { recordLogin } from "@/lib/auth/recordLogin";

/**
 * Called by AuthForm right after a sign-in code is verified. The code-based
 * login runs verifyOtp in the browser and never passes through
 * /auth/callback, so without this a brand-new account had a Supabase auth
 * user but no `users` row (and every progress/answer save failed its foreign
 * key). Identity comes only from the verified session cookie -- the request
 * body is ignored.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
