import { BlogPostForm } from "@/components/admin/BlogPostForm";

export default function NewBlogPostPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">New blog post</h1>
      <BlogPostForm />
    </div>
  );
}
