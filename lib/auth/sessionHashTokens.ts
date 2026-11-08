/**
 * Parses an implicit-flow Supabase Auth URL fragment
 * (`#access_token=...&refresh_token=...`) into its two tokens, or returns
 * null if the fragment isn't this shape at all -- see
 * components/auth/SessionHashRecovery.tsx for why this fragment can show up
 * here instead of the normal PKCE `?code=` flow.
 */
export function parseSessionTokensFromHash(
  hash: string
): { accessToken: string; refreshToken: string } | null {
  if (!hash.includes("access_token=") || !hash.includes("refresh_token=")) return null;

  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}
