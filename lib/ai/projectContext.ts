import { getDb } from "@/lib/db/client";
import { posts, studies, lessons, contentBlocks } from "@/lib/db/schema";
import { asc, desc, eq, and, inArray, isNull } from "drizzle-orm";
import { getDisplayStudyTitles } from "@/lib/study/displayTitle";
import { studyKindLabel, type StudyKind } from "@/lib/study/studyKindLabel";
import type { PublishedLessonContent } from "@/lib/lessons/publishedContentTypes";
import type { StudyWeekContent } from "@/lib/study/studyContent";

const RECENT_POST_COUNT = 3;
const POST_EXCERPT_CHARS = 300;
const LESSONS_WITH_EXCERPTS = 4;
const LESSON_EXCERPT_CHARS = 300;

/**
 * Rules the social and blog suggestion prompts both add to their system
 * prompt, so Claude promotes only what the context below says a visitor can
 * actually open. Without it, Claude happily names anything it read about.
 */
export const PROMOTION_RULES = `Promote only what the project context lists: the free samples and the blog posts. The store is closed until the full launch, so never name, describe or invite readers to any other book, study, devotional, bundle or product, even one you know of or one the additional instruction mentions; if the instruction asks for something not listed, write about the free samples instead. Send readers to souldustrevival.com, where anyone can sign up free and read the samples.`;

/**
 * Strips HTML tags from rich-text content down to plain text for use in an
 * LLM prompt — the model doesn't need markup, just the words.
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export type ContextSampleStudy = {
  kind: StudyKind;
  title: string;
  description: string | null;
  lessons: { title: string; excerpt: string }[];
};

export type ContextPost = { title: string; body: string };

/**
 * The words a reader meets first in a lesson: the first text block, or for
 * a structured study week (studyContent) its subtitle, key verse and first
 * paragraph. Takes the same content the reader renders — the published
 * snapshot when there is one — so draft text never reaches a prompt.
 */
export function lessonExcerpt(
  published: PublishedLessonContent | null,
  workingStudyContent: StudyWeekContent | null,
  workingTextBody: string | null
): string {
  const week = published ? published.studyContent : workingStudyContent;
  const textBody = published
    ? (published.blocks.find((b) => b.type === "text")?.body ?? null)
    : workingTextBody;
  let text = "";
  if (week) {
    const firstPara = week.study.sections[0]?.paras[0] ?? week.study.parts[0]?.paras[0] ?? "";
    text = [week.subtitle, week.keyVerse && `"${week.keyVerse}" (${week.keyRef})`, firstPara]
      .filter(Boolean)
      .join(" — ");
  } else if (textBody) {
    text = textBody;
  }
  return stripHtml(text).slice(0, LESSON_EXCERPT_CHARS);
}

/**
 * Renders the context block. Pure, so the wording Claude sees is tested
 * without a database. Says plainly what is public and that nothing else is.
 */
export function formatProjectContext(samples: ContextSampleStudy[], recentPosts: ContextPost[]): string {
  const lines: string[] = [
    "What is open to the public on souldustrevival.com right now. The site is in a pre-launch sneak peek: the store is closed, and anyone can sign up free to read these samples. Nothing else is available yet.",
    "",
    "Free samples:",
  ];
  if (samples.length === 0) lines.push("- (none published)");
  for (const s of samples) {
    const included = s.lessons.map((l) => l.title).join(", ");
    lines.push(`- ${studyKindLabel(s.kind)}: "${s.title}" (free sample: ${included})${s.description ? ` — ${stripHtml(s.description)}` : ""}`);
    for (const l of s.lessons) {
      if (l.excerpt) lines.push(`  - ${l.title}: ${l.excerpt}`);
    }
  }
  lines.push("", "Recent blog posts (public at souldustrevival.com/blog):");
  if (recentPosts.length === 0) lines.push("- (none published)");
  for (const p of recentPosts) {
    lines.push(`- ${p.title}: ${stripHtml(p.body).slice(0, POST_EXCERPT_CHARS)}`);
  }
  return lines.join("\n");
}

/**
 * Builds the grounding context for the social and blog suggestion endpoints:
 * the free sample (published sample lessons of published studies — the same
 * rule as the /sneak-peek page and the reader) and recent published blog
 * posts. Studies with no free sample (e.g. a book not yet on sale) are left
 * out entirely, since the live site doesn't offer them during the sneak peek.
 * Revisit at full launch, when the store's catalog becomes promotable.
 */
export async function gatherProjectContext(): Promise<string> {
  const db = await getDb();

  const recentPosts = await db
    .select({ title: posts.title, body: posts.body })
    .from(posts)
    .where(eq(posts.published, true))
    .orderBy(desc(posts.publishedAt))
    .limit(RECENT_POST_COUNT);

  const sampleLessons = await db
    .select({
      id: lessons.id,
      studyId: lessons.studyId,
      title: lessons.title,
      studyContent: lessons.studyContent,
      publishedContent: lessons.publishedContent,
    })
    .from(lessons)
    .innerJoin(studies, eq(studies.id, lessons.studyId))
    .where(and(eq(lessons.isSample, true), eq(lessons.published, true), eq(studies.published, true)))
    .orderBy(asc(lessons.orderIndex));

  const studyIds = [...new Set(sampleLessons.map((l) => l.studyId))];
  const sampleStudies =
    studyIds.length === 0
      ? []
      : await db
          .select({ id: studies.id, title: studies.title, productId: studies.productId, kind: studies.kind, description: studies.description })
          .from(studies)
          .where(inArray(studies.id, studyIds))
          .orderBy(asc(studies.createdAt));
  const titles = await getDisplayStudyTitles(db, sampleStudies);

  // Working-copy text blocks, only for lessons with no published snapshot.
  const unsnapshotted = sampleLessons.filter((l) => !l.publishedContent).map((l) => l.id);
  const textBlocks =
    unsnapshotted.length === 0
      ? []
      : await db
          .select({ lessonId: contentBlocks.lessonId, body: contentBlocks.body })
          .from(contentBlocks)
          .where(and(inArray(contentBlocks.lessonId, unsnapshotted), eq(contentBlocks.type, "text"), isNull(contentBlocks.removedAt)))
          .orderBy(asc(contentBlocks.orderIndex));

  const samples: ContextSampleStudy[] = sampleStudies.map((s) => ({
    kind: s.kind,
    title: titles.get(s.id) ?? s.title,
    description: s.description,
    // Every free lesson is named; only the first few carry an excerpt, to
    // keep the prompt short.
    lessons: sampleLessons
      .filter((l) => l.studyId === s.id)
      .map((l, i) => ({
        title: l.title,
        excerpt:
          i < LESSONS_WITH_EXCERPTS
            ? lessonExcerpt(l.publishedContent, l.studyContent, textBlocks.find((b) => b.lessonId === l.id)?.body ?? null)
            : "",
      })),
  }));

  return formatProjectContext(samples, recentPosts);
}
