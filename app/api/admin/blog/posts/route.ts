import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/guard";
import { getDb } from "@/lib/db/client";
import { posts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import DOMPurify from "isomorphic-dompurify";
import { blogPostCreateSchema, blogPostUpdateSchema } from "@/lib/validation/schemas";

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = blogPostCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  // Stored body is Tiptap-authored HTML, sanitized here on write and again
  // at render time (app/(marketing)/blog/[slug]/page.tsx) -- same
  // defense-in-depth pattern as lesson content and leader resources (see
  // SECURITY.md).
  const sanitizedBody = DOMPurify.sanitize(body.body);
  const db = await getDb();

  const [post] = await db
    .insert(posts)
    .values({
      title: body.title,
      slug: body.slug,
      body: sanitizedBody,
      published: body.published,
      publishedAt: body.published ? new Date() : null,
      sourceType: body.sourceType,
      aiPrompt: body.aiPrompt,
      createdByUserId: session.userId,
    })
    .returning();

  if (!post) return NextResponse.json({ error: "post_creation_failed" }, { status: 500 });

  return NextResponse.json(post);
}

export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const json = await req.json();
  const parsed = blogPostUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
  const db = await getDb();

  const existing = await db.query.posts.findFirst({ where: eq(posts.id, body.id) });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Set publishedAt the first time a post transitions to published, but
  // don't overwrite it on every subsequent edit of an already-published post.
  const justPublished = body.published === true && !existing.published;
  const sanitizedBody = body.body != null ? DOMPurify.sanitize(body.body) : body.body;

  const [updated] = await db
    .update(posts)
    .set({
      title: body.title,
      slug: body.slug,
      body: sanitizedBody,
      published: body.published,
      ...(justPublished ? { publishedAt: new Date() } : {}),
    })
    .where(eq(posts.id, body.id))
    .returning();

  return NextResponse.json(updated);
}
