import { db } from "@/lib/db/client";
import { socialPosts, socialPostTargets } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { PLATFORM_LABELS } from "@/lib/data/socialPlatforms";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  scheduled: "bg-blue-100 text-blue-800",
  sending: "bg-amber-100 text-amber-800",
  published: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  paused: "bg-neutral-100 text-neutral-600",
};

export default async function SocialPostsPage() {
  const allPosts = await db.select().from(socialPosts).orderBy(desc(socialPosts.createdAt)).limit(100);
  const allTargets = await db.select().from(socialPostTargets);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Social posts</h1>
        <Link href="/admin/social/new" className="inline-block bg-neutral-900 text-white rounded-lg px-4 py-2 text-center">
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
        {allPosts.length === 0 && <p className="p-4 text-neutral-600">No social posts yet.</p>}
      </div>
    </div>
  );
}
