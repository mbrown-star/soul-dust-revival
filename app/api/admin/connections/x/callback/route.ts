import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { upsertConnection } from "@/lib/social/connections";

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.redirect(`${req.nextUrl.origin}/login?next=/admin/settings/connections`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("x_oauth_state")?.value;
  const verifier = req.cookies.get("x_oauth_verifier")?.value;

  // Validates the CSRF state param and confirms this callback actually
  // followed an authorize request we issued (verifier only exists if the
  // authorize step ran first) — rejects a forged/replayed callback.
  if (!code || !state || !verifier || state !== storedState) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/admin/settings/connections?error=x_oauth_failed`
    );
  }

  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const redirectUri = `${req.nextUrl.origin}/api/admin/connections/x/callback`;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/admin/settings/connections?error=x_token_exchange_failed`
    );
  }

  const tokenData = await tokenRes.json();

  // Fetch the connected account's handle for display in the Connections UI.
  const meRes = await fetch("https://api.twitter.com/2/users/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const me = meRes.ok ? await meRes.json() : null;

  await upsertConnection({
    provider: "x",
    displayName: me?.data?.username ? `@${me.data.username}` : "X account",
    externalAccountId: me?.data?.id ?? null,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    connectedByUserId: session.userId,
  });

  const response = NextResponse.redirect(`${req.nextUrl.origin}/admin/settings/connections?connected=x`);
  response.cookies.delete("x_oauth_verifier");
  response.cookies.delete("x_oauth_state");
  return response;
}
