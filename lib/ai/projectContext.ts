import { db } from "@/lib/db/client";
import { posts, studies, lessons, contentBlocks } from "@/lib/db/schema";
import { desc, eq, and, inArray } from "drizzle-orm";

/**
 * Strips HTML tags from rich-text block content down to plain text for use
 * in an LLM prompt — the model doesn't need markup, just the words.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Builds a text summary of this project's own recent content — published
 * blog posts, and published studies including a sample of their actual
 * lesson text content (not just the study's title/description) — for
 * grounding AI-generated suggestions in what this platform actually says,
 * not a generic prompt. Shared by both the social and blog suggestion
 * endpoints so the two draw from the same notion of "recent content."
 */
export async function gatherProjectContext(): Promise<string> {
  const recentPosts = await db
    .select({ title: posts.title, body: posts.body })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.publishedAt))
    .limit(3);

  const recentStudies = await db
    .select({ id: studies.id, title: studies.title, description: studies.description })
    .from(studies)
    .where(eq(studies.published, true))
    .orderBy(desc(studies.createdAt))
    .limit(3);

  const studyIds = recentStudies.map((s) => s.id);

  const relevantLessons =
    studyIds.length > 0
      ? await db
          .select({ id: lessons.id, studyId: lessons.studyId, title: lessons.title })
          .from(lessons)
          .where(and(inArray(lessons.studyId, studyIds), eq(lessons.published, true)))
      : [];

  const lessonIds = relevantLessons.map((l) => l.id);

  const textBlocks =
    lessonIds.length > 0
      ? await db
          .select({ lessonId: contentBlocks.lessonId, body: contentBlocks.body })
          .from(contentBlocks)
          .where(and(inArray(contentBlocks.lessonId, lessonIds), eq(contentBlocks.type, "text")))
      : [];

  const lessonExcerpts = relevantLessons.slice(0, 6).map((lesson) => {
    const block = textBlocks.find((b) => b.lessonId === lesson.id);
    const excerpt = block?.body ? stripHtml(block.body).slice(0, 250) : "";
    return `  - Lesson "${lesson.title}": ${excerpt}`;
  });

  return [
    "Recent blog posts:",
    ...recentPosts.map((p) => `- ${p.title}: ${p.body.slice(0, 300)}`),
    "Recent studies (with sample lesson content):",
    ...recentStudies.map((s) => `- ${s.title}: ${s.description ?? ""}`),
    ...lessonExcerpts,
  ].join("\n");
}
