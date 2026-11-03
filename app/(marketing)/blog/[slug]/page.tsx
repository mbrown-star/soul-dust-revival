import { db } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import Link from "next/link";
import type { Metadata } from "next";

// Rendered dynamically per-request rather than statically at build time —
// this reads live product/post data an admin can change anytime, and a
// static build would otherwise freeze this content as of the last deploy
// (and would require a live database reachable during the build itself).
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await db.query.posts.findFirst({ where: eq(posts.slug, slug) });
  return { title: post?.title ?? "Not found" };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const post = await db.query.posts.findFirst({ where: eq(posts.slug, slug) });
  if (!post || !post.published) notFound();

  return (
    <article className="max-w-2xl mx-auto px-4 py-12 sm:py-16">
      <Link href="/blog" className="font-sans text-sm text-moss hover:text-ember focus:outline-none focus:ring-2 focus:ring-ink rounded">
        ← Blog
      </Link>

      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mt-4 mb-2">
        {post.title}
      </h1>
      {post.publishedAt && (
        <p className="font-sans text-sm text-moss mb-8">
          {new Date(post.publishedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      )}

      <div
        className="prose max-w-none font-serif prose-headings:font-display prose-a:text-ember"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }}
      />
    </article>
  );
}
