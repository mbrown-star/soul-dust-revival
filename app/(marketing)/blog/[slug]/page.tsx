import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { sanitizeHtml } from "@/lib/sanitize/html";
import Link from "next/link";
import type { Metadata } from "next";
import { formatDate } from "@/lib/format/date";

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
  const db = await getDb();
  const post = await db.query.posts.findFirst({ where: eq(posts.slug, slug) });
  return { title: post?.title ?? "Not found" };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await getDb();

  const post = await db.query.posts.findFirst({ where: eq(posts.slug, slug) });
  if (!post || !post.published) notFound();

  return (
    // max-w-5xl matches the standard page width used site-wide (see
    // CLAUDE.md's "Standard page width" rule) -- the prose block below
    // fills that full width too (max-w-none overrides Tailwind Typography's
    // own narrower readable-measure default), per explicit request.
    <article className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <Link href="/blog" className="font-sans text-sm text-moss hover:text-ink focus:outline-none focus:ring-2 focus:ring-ink rounded">
        ← Blog
      </Link>

      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mt-4 mb-2">
        {post.title}
      </h1>
      {post.publishedAt && (
        <p className="font-sans text-sm text-moss mb-8">
          {formatDate(post.publishedAt)}
        </p>
      )}

      <div
        className="prose max-w-none font-serif prose-headings:font-display prose-a:text-moss"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body) }}
      />
    </article>
  );
}
