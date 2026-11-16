import { upsertConnection } from "@/lib/social/connections";
import { refreshXTokenIfNeeded } from "@/lib/social/publishers/x";

/**
 * The X connection's access token, refreshed first when it's about to expire
 * (X's tokens last about two hours). A refresh rotates the refresh token, so
 * the new pair is saved straight away. Used by publishing and by the daily
 * metrics job; before 2026-11-16 only publishing refreshed, so metrics for X
 * failed with a 401 whenever no post had gone out in the last two hours.
 */
export async function freshXAccessToken(connection: {
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  displayName: string | null;
  externalAccountId: string | null;
}): Promise<string> {
  const refreshed = await refreshXTokenIfNeeded(connection);
  if (!refreshed) return connection.accessToken;
  await upsertConnection({
    provider: "x",
    displayName: connection.displayName,
    externalAccountId: connection.externalAccountId,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    tokenExpiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}
