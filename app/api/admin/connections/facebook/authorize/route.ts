import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { generateState } from "@/lib/social/pkce";

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "FACEBOOK_APP_ID is not configured" }, { status: 500 });
  }

  const state = generateState();
  const redirectUri = `${req.nextUrl.origin}/api/admin/connections/facebook/callback`;

  const authorizeUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  // pages_manage_posts/pages_read_engagement: posting + metrics on the Page.
  // instagram_basic/instagram_content_publish: covers Instagram too, since
  // IG posting goes through the same Page's connected IG business account.
  authorizeUrl.searchParams.set(
    "scope",
    "pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,business_management"
  );

  const response = NextResponse.redirect(authorizeUrl.toString());
  response.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
