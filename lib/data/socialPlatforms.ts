export type SocialPlatform = "x" | "facebook" | "instagram";

/**
 * Character limits shown live in the post composer. X's limit is a hard
 * API rejection if exceeded; Facebook's is generous enough it's rarely hit
 * in practice but is still enforced by their API; Instagram's is a genuine
 * caption cap. Source: each platform's current developer documentation —
 * worth double-checking these numbers occasionally, since platforms do
 * change them (X's limit in particular has shifted with product changes).
 */
export const PLATFORM_LIMITS: Record<SocialPlatform, number> = {
  x: 280,
  facebook: 63_206,
  instagram: 2_200,
};

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
};

export const ALL_PLATFORMS: SocialPlatform[] = ["x", "facebook", "instagram"];
