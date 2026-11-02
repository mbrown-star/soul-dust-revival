import { getConnection, upsertConnection } from "@/lib/social/connections";
import { publishToX, refreshXTokenIfNeeded } from "@/lib/social/publishers/x";
import { publishToFacebook } from "@/lib/social/publishers/facebook";
import { publishToInstagram } from "@/lib/social/publishers/instagram";

export async function publishTarget(params: {
  platform: "x" | "facebook" | "instagram";
  body: string;
  imageUrl?: string | null;
}): Promise<{ externalPostId: string }> {
  const connection = await getConnection(params.platform);
  if (!connection || connection.status !== "connected" || !connection.accessToken) {
    throw new Error(`${params.platform} is not connected`);
  }

  let accessToken = connection.accessToken;

  if (params.platform === "x") {
    const refreshed = await refreshXTokenIfNeeded({
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      tokenExpiresAt: connection.tokenExpiresAt,
    });
    if (refreshed) {
      accessToken = refreshed.accessToken;
      await upsertConnection({
        provider: "x",
        displayName: connection.displayName,
        externalAccountId: connection.externalAccountId,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.expiresAt,
      });
    }
  }

  switch (params.platform) {
    case "x":
      return publishToX({ accessToken, body: params.body, imageUrl: params.imageUrl });

    case "facebook":
      if (!connection.externalAccountId) throw new Error("Facebook Page ID missing on connection");
      return publishToFacebook({
        pageAccessToken: accessToken,
        pageId: connection.externalAccountId,
        body: params.body,
        imageUrl: params.imageUrl,
      });

    case "instagram":
      if (!connection.externalAccountId) throw new Error("Instagram account ID missing on connection");
      if (!params.imageUrl) throw new Error("Instagram requires an image — this post has none");
      return publishToInstagram({
        pageAccessToken: accessToken,
        igUserId: connection.externalAccountId,
        body: params.body,
        imageUrl: params.imageUrl,
      });
  }
}
