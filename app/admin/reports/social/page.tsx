import { getDb } from "@/lib/db/client";
import { socialPostTargets, socialPosts, socialPostMetrics } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { PLATFORM_LABELS } from "@/lib/data/socialPlatforms";

export const dynamic = "force-dynamic";

export default async function SocialAnalyticsPage() {
  const db = await getDb();
  const publishedTargets = await db
    .select({
      id: socialPostTargets.id,
      platform: socialPostTargets.platform,
      publishedAt: socialPostTargets.publishedAt,
      body: socialPosts.body,
    })
    .from(socialPostTargets)
    .leftJoin(socialPosts, eq(socialPostTargets.postId, socialPosts.id))
    .where(eq(socialPostTargets.status, "published"))
    .orderBy(desc(socialPostTargets.publishedAt))
    .limit(100);

  // Latest metrics snapshot per target — social_post_metrics keeps every
  // fetch as its own row for trend history and only grows over time, so this
  // scopes to the targets this page actually displays (DISTINCT ON picks the
  // newest row per target_id directly in SQL) rather than pulling the whole
  // ever-growing history table and reducing it in JS.
  const targetIds = publishedTargets.map((t) => t.id);
  const latestMetrics =
    targetIds.length === 0
      ? []
      : await db
          .selectDistinctOn([socialPostMetrics.targetId])
          .from(socialPostMetrics)
          .where(inArray(socialPostMetrics.targetId, targetIds))
          .orderBy(socialPostMetrics.targetId, desc(socialPostMetrics.fetchedAt));

  const latestByTarget = new Map(latestMetrics.map((m) => [m.targetId, m]));

  const totals = { likes: 0, comments: 0, shares: 0 };
  for (const m of latestByTarget.values()) {
    totals.likes += m.likes;
    totals.comments += m.comments;
    totals.shares += m.shares;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reports" className="text-sm text-moss">← Reports</Link>
        <h1 className="text-xl font-semibold">Social analytics</h1>
        <p className="text-sm text-moss mt-1">
          Metrics refresh periodically via a scheduled job — see SOCIAL.md — so numbers
          here may lag a live view on the platform itself by up to that job&apos;s interval.
        </p>
      </div>

      <div className="flex gap-8">
        <div>
          <p className="text-2xl font-semibold">{totals.likes}</p>
          <p className="text-sm text-moss">Likes</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{totals.comments}</p>
          <p className="text-sm text-moss">Comments</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{totals.shares}</p>
          <p className="text-sm text-moss">Shares/reposts</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b text-moss">
              <th scope="col" className="py-2 pr-4 font-medium">Post</th>
              <th scope="col" className="py-2 pr-4 font-medium">Platform</th>
              <th scope="col" className="py-2 pr-4 font-medium">Published</th>
              <th scope="col" className="py-2 pr-4 font-medium">Likes</th>
              <th scope="col" className="py-2 pr-4 font-medium">Comments</th>
              <th scope="col" className="py-2 font-medium">Shares</th>
            </tr>
          </thead>
          <tbody>
            {publishedTargets.map((t) => {
              const m = latestByTarget.get(t.id);
              return (
                <tr key={t.id} className="border-b border-moss/20">
                  <td className="py-3 pr-4 max-w-xs truncate">{t.body}</td>
                  <td className="py-3 pr-4">{PLATFORM_LABELS[t.platform]}</td>
                  <td className="py-3 pr-4 text-moss">
                    {t.publishedAt ? new Date(t.publishedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3 pr-4">{m?.likes ?? "—"}</td>
                  <td className="py-3 pr-4">{m?.comments ?? "—"}</td>
                  <td className="py-3">{m?.shares ?? "—"}</td>
                </tr>
              );
            })}
            {publishedTargets.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-moss">No published posts yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
