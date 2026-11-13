import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { formatDate } from "@/lib/format/date";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Blog" };

export default async function AdminBlogPage() {
  const db = await getDb();
  // Safety cap, not real pagination -- unlike the other admin-curated lists,
  // blog posts can realistically accumulate like a real content archive, so
  // this uses a higher cap than the others; add real pagination before this
  // gets anywhere near it.
  const allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(1000);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h1 className="text-xl font-semibold">Blog</h1>
        <Link href="/admin/blog/new" className="inline-block bg-ink text-white rounded-lg px-4 py-2 text-center">
          + New post
        </Link>
      </div>

      <div className="divide-y border rounded-lg">
        {allPosts.map((p) => (
          <Link key={p.id} href={`/admin/blog/${p.id}`} className="flex justify-between items-center p-4 hover:bg-moss/5">
            <span>{p.title}</span>
            <span className="flex items-center gap-2 text-sm text-moss">
              {p.sourceType === "ai_suggested" && <span className="text-xs bg-moss/10 px-2 py-0.5 rounded-full">AI</span>}
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  p.published ? "bg-success/10 text-success" : "bg-gold/20 text-ink"
                }`}
              >
                {p.published ? "Published" : "Draft"}
              </span>
              {p.published && p.publishedAt ? formatDate(p.publishedAt) : p.createdAt ? `Started ${formatDate(p.createdAt)}` : null}
            </span>
          </Link>
        ))}
        {allPosts.length === 0 && <p className="p-4 text-moss">No blog posts yet.</p>}
      </div>
    </div>
  );
}
