import { getConnection } from "@/lib/social/connections";
import { freshXAccessToken } from "@/lib/social/xToken";

/**
 * One snapshot of a post's numbers. A count the platform wouldn't give us
 * (a missing permission, a metric that doesn't exist there) is null, shown as
 * "—", rather than a 0 that would read as "nobody did this".
 */
export type Metrics = {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  impressions: number | null;
};

const GRAPH = "https://graph.facebook.com/v21.0";

/** Reads one Graph API object; null when the call is refused (e.g. a missing permission). */
async function graphGet<T>(path: string, accessToken: string): Promise<T | null> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`Graph metrics call refused (${res.status}): ${path.split("?")[0]} ${detail.slice(0, 300)}`);
    return null;
  }
  return (await res.json()) as T;
}

export async function fetchMetrics(
  platform: "x" | "facebook" | "instagram",
  externalPostId: string
): Promise<Metrics> {
  const connection = await getConnection(platform);
  if (!connection || !connection.accessToken) {
    throw new Error(`${platform} is not connected`);
  }

  if (platform === "x") {
    const accessToken = await freshXAccessToken({ ...connection, accessToken: connection.accessToken });
    const res = await fetch(
      `https://api.twitter.com/2/tweets/${encodeURIComponent(externalPostId)}?tweet.fields=public_metrics`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`X metrics fetch failed: ${res.status}`);
    const data = (await res.json()) as {
      data: {
        public_metrics: {
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          quote_count?: number;
          impression_count?: number;
        };
      };
    };
    const m = data.data.public_metrics;
    return {
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      // Reposts, plus quote posts (a repost with your own words added).
      shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      impressions: m.impression_count ?? null,
    };
  }

  if (platform === "facebook") {
    // Asked for separately: `shares` needs only pages_read_engagement, while
    // likes and comments need pages_read_user_content too, and one refused
    // field fails the whole call. A post nobody has shared has no `shares`
    // field at all, so a successful call without it means 0.
    const id = encodeURIComponent(externalPostId);
    const [sharesData, engagement] = await Promise.all([
      graphGet<{ shares?: { count?: number } }>(`${id}?fields=shares`, connection.accessToken),
      graphGet<{
        likes?: { summary?: { total_count?: number } };
        comments?: { summary?: { total_count?: number } };
      }>(`${id}?fields=likes.summary(true),comments.summary(true)`, connection.accessToken),
    ]);
    if (!sharesData && !engagement) throw new Error("Facebook refused every metrics call");
    return {
      likes: engagement ? (engagement.likes?.summary?.total_count ?? 0) : null,
      comments: engagement ? (engagement.comments?.summary?.total_count ?? 0) : null,
      shares: sharesData ? (sharesData.shares?.count ?? 0) : null,
      impressions: null, // requires a separate Page Insights permission tier — not assumed available
    };
  }

  // Instagram: likes and comments are fields on the media; shares only come
  // from Insights, which needs instagram_manage_insights.
  const id = encodeURIComponent(externalPostId);
  const [media, insights] = await Promise.all([
    graphGet<{ like_count?: number; comments_count?: number }>(
      `${id}?fields=like_count,comments_count`,
      connection.accessToken
    ),
    graphGet<{ data?: { name: string; values?: { value?: number }[]; total_value?: { value?: number } }[] }>(
      `${id}/insights?metric=shares`,
      connection.accessToken
    ),
  ]);
  if (!media && !insights) throw new Error("Instagram refused every metrics call");
  const sharesMetric = insights?.data?.find((d) => d.name === "shares");
  const sharesValue = sharesMetric?.total_value?.value ?? sharesMetric?.values?.[0]?.value;
  return {
    likes: media ? (media.like_count ?? 0) : null,
    comments: media ? (media.comments_count ?? 0) : null,
    shares: insights ? (sharesValue ?? 0) : null,
    impressions: null,
  };
}
