import { getDb } from "@/lib/db/client";
import { socialPosts, socialPostTargets } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { PLATFORM_LABELS } from "@/lib/data/socialPlatforms";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-moss/10 text-moss",
  scheduled: "bg-ember/10 text-ember-700",
  sending: "bg-gold/20 text-gold-700",
  published: "bg-success/10 text-success",
  failed: "bg-error/10 text-error",
  paused: "bg-moss/10 text-moss",
};

export default async function SocialPostsPage() {
  const db = await getDb();
  const allPosts = await db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt)).limit(100);

  // Scoped to just the posts this page displays, rather than the whole
  // targets table -- that table only grows as more posts/platforms get
  // scheduled, while this page always shows at most the 100 most recent posts.
  const postIds = allPosts.map((p) => p.id);
  const allTargets =
    postIds.length === 0 ? [] : await db.select().from(socialPostTargets).where(inArray(socialPostTargets.postId, postIds));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Social posts</h1>
        <Link href="/admin/social/new" className="inline-block bg-ink text-white rounded-lg px-4 py-2 text-center">
          + New post
        </Link>
      </div>

      <div className="divide-y border rounded-lg">
        {allPosts.map((post) => {
          const targets = allTargets.filter((t) => t.postId === post.id);
          return (
            <div key={post.id} className="p-4">
              <p className="text-sm mb-2 line-clamp-2">{post.body}</p>
              <div className="flex flex-wrap gap-2">
                {targets.map((t) => (
                  <span key={t.id} className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[t.status]}`}>
                    {PLATFORM_LABELS[t.platform]} · {t.status}
                    {t.frequency !== "once" && ` · ${t.frequency}`}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {allPosts.length === 0 && <p className="p-4 text-moss">No social posts yet.</p>}
      </div>
    </div>
  );
}
