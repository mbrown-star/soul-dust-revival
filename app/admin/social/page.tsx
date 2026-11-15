import { getDb } from "@/lib/db/client";
import { socialPosts, socialPostTargets } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { PLATFORM_LABELS } from "@/lib/data/socialPlatforms";
import { PUBLISH_NOW_FROM } from "@/lib/social/publishClaimed";
import { PublishNowButton } from "@/components/admin/social/PublishNowButton";
import { LocalDateTime } from "@/components/admin/social/LocalDateTime";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Social" };

export const dynamic = "force-dynamic";

// FIXED (axe-core, qa/e2e/specs/accessibility.spec.ts): "scheduled" used
// text-ember-700 on bg-ember/10, which composites to 4.45:1 at this badge's
// text-xs size -- under WCAG AA's 4.5:1 (ember-700 only clears AA against a
// full-strength parchment/white background). Keeps the ember tint as the
// visual cue, text recolored to ink (15.9:1 against the same background).
const STATUS_STYLES: Record<string, string> = {
  draft: "bg-moss/10 text-moss",
  scheduled: "bg-ember/10 text-ink",
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
              <ul className="space-y-2">
                {targets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={`px-2 py-1 rounded-full ${STATUS_STYLES[t.status]}`}>
                      {PLATFORM_LABELS[t.platform]} · {t.status}
                      {t.frequency !== "once" && ` · ${t.frequency}`}
                    </span>
                    {t.status === "scheduled" && (
                      <span className="text-moss">
                        Next: <LocalDateTime iso={t.nextRunAt.toISOString()} />
                      </span>
                    )}
                    {t.status === "published" && t.publishedAt && (
                      <span className="text-moss">
                        Published <LocalDateTime iso={t.publishedAt.toISOString()} />
                      </span>
                    )}
                    {PUBLISH_NOW_FROM.includes(t.status) && (
                      <PublishNowButton targetId={t.id} platformLabel={PLATFORM_LABELS[t.platform]} />
                    )}
                    {t.status === "failed" && t.lastError && (
                      <span className="basis-full text-error break-words">{t.lastError.slice(0, 300)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {allPosts.length === 0 && <p className="p-4 text-moss">No social posts yet.</p>}
      </div>
    </div>
  );
}
