import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { finalizeFacebookConnection } from "@/lib/social/finalizeFacebookConnection";
import { encryptToken } from "@/lib/crypto/tokenCipher";

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.redirect(`${req.nextUrl.origin}/login?next=/admin/settings/connections`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get("fb_oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/admin/settings/connections?error=facebook_oauth_failed`
    );
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = `${req.nextUrl.origin}/api/admin/connections/facebook/callback`;

  // Step 1: exchange the code for a short-lived user access token.
  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/admin/settings/connections?error=facebook_token_exchange_failed`
    );
  }
  const { access_token: shortLivedToken } = (await tokenRes.json()) as { access_token: string };

  // Step 2: exchange for a long-lived user token (~60 days vs. ~1-2 hours) —
  // scheduled posts need to outlive a short-lived token.
  const longLivedUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", appId);
  longLivedUrl.searchParams.set("client_secret", appSecret);
  longLivedUrl.searchParams.set("fb_exchange_token", shortLivedToken);

  const longLivedRes = await fetch(longLivedUrl.toString());
  const longLivedData = longLivedRes.ok ? ((await longLivedRes.json()) as { access_token?: string }) : null;
  const userAccessToken = longLivedData?.access_token ?? shortLivedToken;

  // Step 3: list the Pages this user manages, with each Page's own access
  // token — posting to a Page requires the Page token, not the user token.
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(userAccessToken)}`
  );
  const pagesData = pagesRes.ok
    ? ((await pagesRes.json()) as { data?: { id: string; name: string; access_token: string }[] })
    : null;
  const pages: { id: string; name: string; access_token: string }[] = pagesData?.data ?? [];

  if (pages.length === 0) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/admin/settings/connections?error=no_facebook_page_found`
    );
  }

  if (pages.length === 1) {
    const onlyPage = pages[0];
    if (!onlyPage) {
      return NextResponse.redirect(
        `${req.nextUrl.origin}/admin/settings/connections?error=no_facebook_page_found`
      );
    }
    await finalizeFacebookConnection(onlyPage, session.userId);
    const response = NextResponse.redirect(`${req.nextUrl.origin}/admin/settings/connections?connected=facebook`);
    response.cookies.delete("fb_oauth_state");
    return response;
  }

  // More than one Page: let the admin choose, rather than silently picking
  // the first one. The page list (including each Page's own access token)
  // is encrypted and stashed in a short-lived cookie — it only needs to
  // survive the single redirect to the picker screen and back.
  const encrypted = encryptToken(JSON.stringify(pages));
  const pickerResponse = NextResponse.redirect(`${req.nextUrl.origin}/admin/settings/connections/facebook-picker`);
  pickerResponse.cookies.delete("fb_oauth_state");
  pickerResponse.cookies.set("fb_pending_pages", encrypted, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return pickerResponse;
}
