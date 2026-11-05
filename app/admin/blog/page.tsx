import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Link from "next/link";

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
        <Link href="/admin/blog/new" className="inline-block bg-neutral-900 text-white rounded-lg px-4 py-2 text-center">
          + New post
        </Link>
      </div>

      <div className="divide-y border rounded-lg">
        {allPosts.map((p) => (
          <Link key={p.id} href={`/admin/blog/${p.id}`} className="flex justify-between items-center p-4 hover:bg-neutral-50">
            <span>{p.title}</span>
            <span className="flex items-center gap-2 text-sm text-neutral-400">
              {p.sourceType === "ai_suggested" && <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full">AI</span>}
              {!p.published && "draft"}
            </span>
          </Link>
        ))}
        {allPosts.length === 0 && <p className="p-4 text-neutral-600">No blog posts yet.</p>}
      </div>
    </div>
  );
}
