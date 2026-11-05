import { upsertConnection } from "@/lib/social/connections";

export type FacebookPageOption = {
  id: string;
  name: string;
  access_token: string;
};

/**
 * Connects a specific Facebook Page (and its linked Instagram business
 * account, if any) — shared between the auto-connect path (account manages
 * only one Page) and the picker path (account manages several).
 */
export async function finalizeFacebookConnection(page: FacebookPageOption, connectedByUserId: string) {
  await upsertConnection({
    provider: "facebook",
    displayName: page.name,
    externalAccountId: page.id,
    accessToken: page.access_token, // Page access tokens don't expire the same way user tokens do
    connectedByUserId,
  });

  // Check whether this Page has a linked Instagram professional account,
  // and connect it too, using the same Page access token — Instagram Graph
  // API calls are authenticated via the linked Page's token.
  const igRes = await fetch(
    `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`
  );
  const igData = igRes.ok ? ((await igRes.json()) as { instagram_business_account?: { id: string } }) : null;
  const igAccountId = igData?.instagram_business_account?.id;

  if (igAccountId) {
    await upsertConnection({
      provider: "instagram",
      displayName: `Instagram (via ${page.name})`,
      externalAccountId: igAccountId,
      accessToken: page.access_token,
      connectedByUserId,
    });
  }
}
