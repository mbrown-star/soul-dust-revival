import { db } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

// Rendered dynamically per-request rather than statically at build time —
// this reads live product/post data an admin can change anytime, and a
// static build would otherwise freeze this content as of the last deploy
// (and would require a live database reachable during the build itself).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog",
};

export default async function BlogPage() {
  const publishedPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.publishedAt));

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-10">Blog</h1>

      {publishedPosts.length === 0 ? (
        <p className="font-serif text-moss">Nothing posted yet — check back soon.</p>
      ) : (
        <div className="space-y-8">
          {publishedPosts.map((post) => (
            <article key={post.id} className="border-b border-moss/20 pb-8">
              <Link href={`/blog/${post.slug}`} className="focus:outline-none focus:ring-2 focus:ring-ink rounded">
                <h2 className="font-display font-semibold text-2xl text-ink hover:text-ember mb-1">
                  {post.title}
                </h2>
              </Link>
              {post.publishedAt && (
                <p className="font-sans text-xs text-moss">
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
