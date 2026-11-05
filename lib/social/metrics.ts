import { getConnection } from "@/lib/social/connections";

export type Metrics = { likes: number; comments: number; shares: number; impressions: number | null };

export async function fetchMetrics(
  platform: "x" | "facebook" | "instagram",
  externalPostId: string
): Promise<Metrics> {
  const connection = await getConnection(platform);
  if (!connection || !connection.accessToken) {
    throw new Error(`${platform} is not connected`);
  }

  if (platform === "x") {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/${externalPostId}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${connection.accessToken}` } }
    );
    if (!res.ok) throw new Error(`X metrics fetch failed: ${res.status}`);
    const data = (await res.json()) as {
      data: { public_metrics: { like_count?: number; reply_count?: number; retweet_count?: number; impression_count?: number } };
    };
    const m = data.data.public_metrics;
    return {
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      shares: m.retweet_count ?? 0,
      impressions: m.impression_count ?? null,
    };
  }

  if (platform === "facebook") {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${externalPostId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(connection.accessToken)}`
    );
    if (!res.ok) throw new Error(`Facebook metrics fetch failed: ${res.status}`);
    const data = (await res.json()) as {
      likes?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
    };
    return {
      likes: data.likes?.summary?.total_count ?? 0,
      comments: data.comments?.summary?.total_count ?? 0,
      shares: data.shares?.count ?? 0,
      impressions: null, // requires a separate Page Insights permission tier — not assumed available
    };
  }

  // instagram
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${externalPostId}?fields=like_count,comments_count&access_token=${encodeURIComponent(connection.accessToken)}`
  );
  if (!res.ok) throw new Error(`Instagram metrics fetch failed: ${res.status}`);
  const data = (await res.json()) as { like_count?: number; comments_count?: number };
  return {
    likes: data.like_count ?? 0,
    comments: data.comments_count ?? 0,
    shares: 0, // not a concept on Instagram's API
    impressions: null,
  };
}
