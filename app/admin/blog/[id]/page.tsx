import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { BlogPostForm } from "@/components/admin/BlogPostForm";
import Link from "next/link";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Edit" };
  const db = await getDb();
  const [row] = await db.select({ title: posts.title }).from(posts).where(eq(posts.id, id)).limit(1);
  return { title: row ? `Edit: ${row.title}` : "Edit" };
}

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
      <Link href="/admin/blog" className="text-sm text-moss">← Blog</Link>
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
