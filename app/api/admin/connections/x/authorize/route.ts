import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "@/lib/social/pkce";

/**
 * Step 1 of X's OAuth 2.0 + PKCE flow. The code_verifier and state are
 * stashed in short-lived httpOnly cookies rather than a database table,
 * since they only need to survive the single redirect round-trip to X and
 * back — a cookie is the simplest correct place for that, and it never
 * needs to be readable by client-side JS.
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "X_CLIENT_ID is not configured" }, { status: 500 });
  }

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  const redirectUri = `${req.nextUrl.origin}/api/admin/connections/x/callback`;

  const authorizeUrl = new URL("https://twitter.com/i/oauth2/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  // tweet.write: posting. users.read: identify the connected account.
  // offline.access: issues a refresh token, since posts are scheduled and
  // may fire long after the initial connection.
  authorizeUrl.searchParams.set("scope", "tweet.write tweet.read users.read offline.access");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authorizeUrl.toString());
  const cookieOpts = { httpOnly: true, secure: true, sameSite: "lax" as const, maxAge: 600, path: "/" };
  response.cookies.set("x_oauth_verifier", verifier, cookieOpts);
  response.cookies.set("x_oauth_state", state, cookieOpts);
  return response;
}
