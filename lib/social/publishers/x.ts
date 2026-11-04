/**
 * Posts to X via API v2. Image upload still goes through the legacy v1.1
 * media/upload endpoint (as of this writing, X hasn't moved media upload to
 * v2) — the OAuth 2.0 user access token from the connection is accepted
 * there directly, so no separate OAuth 1.0a credential is needed.
 */

/**
 * X's OAuth 2.0 access tokens expire quickly (on the order of ~2 hours) —
 * since posts here are scheduled to fire unattended over days or weeks, a
 * connection made once and never refreshed would silently start failing
 * well before most scheduled posts ever fire. Called before every X publish
 * attempt; a no-op if the current token still has reasonable life left.
 */
export async function refreshXTokenIfNeeded(params: {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  const expiresSoon = params.tokenExpiresAt && params.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!expiresSoon) return null; // current token is still good, nothing to do

  if (!params.refreshToken) {
    throw new Error("X access token expired and no refresh token is available — reconnect X in Settings.");
  }

  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`X token refresh failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? params.refreshToken, // X may or may not rotate the refresh token itself
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}
export async function publishToX(params: {
  accessToken: string;
  body: string;
  imageUrl?: string | null;
}): Promise<{ externalPostId: string }> {
  let mediaId: string | null = null;

  if (params.imageUrl) {
    // SSRF guard: imageUrl is only ever supposed to be one of our own R2
    // public object URLs, never an arbitrary admin-supplied host -- fetching
    // anything else server-side could be used to probe/exfiltrate from
    // internal network addresses via the connected X account.
    const allowedOrigin = new URL(process.env.R2_PUBLIC_BASE_URL!).origin;
    if (new URL(params.imageUrl).origin !== allowedOrigin) {
      throw new Error("imageUrl must be hosted on this app's own R2 bucket");
    }

    const imageRes = await fetch(params.imageUrl);
    if (!imageRes.ok) throw new Error(`Couldn't fetch image for upload: ${imageRes.status}`);
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    const form = new FormData();
    form.append("media", new Blob([imageBuffer]));

    const uploadRes = await fetch("https://upload.twitter.com/1.1/media/upload.json", {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      body: form,
    });

    if (!uploadRes.ok) {
      const detail = await uploadRes.text();
      throw new Error(`X media upload failed: ${uploadRes.status} ${detail}`);
    }
    const uploadData = await uploadRes.json();
    mediaId = uploadData.media_id_string;
  }

  const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: params.body,
      ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
    }),
  });

  if (!tweetRes.ok) {
    const detail = await tweetRes.text();
    throw new Error(`X post failed: ${tweetRes.status} ${detail}`);
  }

  const data = await tweetRes.json();
  return { externalPostId: data.data.id };
}
