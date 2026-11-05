import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BlogPostForm } from "@/components/admin/BlogPostForm";
import Link from "next/link";

export default async function EditBlogPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = await getDb();
  const post = await db.query.posts.findFirst({ where: eq(posts.id, id) });
  if (!post) redirect("/admin/blog");

  return (
    <div className="space-y-6">
      <Link href="/admin/blog" className="text-sm text-neutral-400">← Blog</Link>
      <h1 className="text-xl font-semibold">{post.title}</h1>
      <BlogPostForm
        initial={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          body: post.body,
          published: post.published,
        }}
      />
    </div>
  );
}
