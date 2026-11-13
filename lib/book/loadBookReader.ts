import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { contentBlocks, lessonProgress, responses } from "@/lib/db/schema";
import type { ContentBlockData } from "@/lib/content/blocks";
import { htmlToPlainText } from "@/lib/content/plainText";
import { BOOK_PART_SQL_PATTERN, parseBookChapterHtml, parseBookLessonTitle, type ParsedBookChapter } from "./chapterHtml";
import type { BookContentsRow } from "@/components/book/BookContents";
import type { BookJournalChapter } from "@/components/book/BookJournal";

type StudyLesson = { id: string; title: string; isSample: boolean };

/**
 * Everything the book reader's Contents tab, Journal tab and progress ring
 * need, for one reader across the whole book: each lesson's status, each
 * chapter's Part (read from its stored opener, in SQL, so the chapters' full
 * text isn't loaded), and every answer they've written. A few bounded queries
 * for the book's fixed lesson count, not one per chapter.
 */
export async function loadBookOverview(
  db: Db,
  {
    lessons,
    userId,
    studyHref,
    currentLessonId,
    isLocked,
  }: {
    lessons: StudyLesson[];
    userId: string;
    studyHref: string;
    currentLessonId: string;
    isLocked: (l: StudyLesson) => boolean;
  }
): Promise<{
  contents: BookContentsRow[];
  journal: BookJournalChapter[];
  hasQuestions: boolean;
  chaptersRead: number;
  totalChapters: number;
}> {
  const lessonIds = lessons.map((l) => l.id);
  if (lessonIds.length === 0) return { contents: [], journal: [], hasQuestions: false, chaptersRead: 0, totalChapters: 0 };

  const [progressRows, partRows, questionRows] = await Promise.all([
    db
      .select({ lessonId: lessonProgress.lessonId, status: lessonProgress.status })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.userId, userId), inArray(lessonProgress.lessonId, lessonIds))),
    db
      .select({
        lessonId: contentBlocks.lessonId,
        part: sql<string | null>`substring(${contentBlocks.body} from ${BOOK_PART_SQL_PATTERN})`,
      })
      .from(contentBlocks)
      .where(and(inArray(contentBlocks.lessonId, lessonIds), eq(contentBlocks.type, "text"), isNull(contentBlocks.removedAt)))
      .orderBy(asc(contentBlocks.orderIndex)),
    db
      .select({ id: contentBlocks.id, lessonId: contentBlocks.lessonId, questionPrompt: contentBlocks.questionPrompt })
      .from(contentBlocks)
      .where(and(inArray(contentBlocks.lessonId, lessonIds), eq(contentBlocks.type, "question"), isNull(contentBlocks.removedAt)))
      .orderBy(asc(contentBlocks.orderIndex)),
  ]);

  const statusByLessonId = new Map(progressRows.map((r) => [r.lessonId, r.status]));
  // A chapter's Part is in its first text block only.
  const partByLessonId = new Map<string, string | null>();
  for (const row of partRows) {
    if (!partByLessonId.has(row.lessonId)) partByLessonId.set(row.lessonId, row.part ? htmlToPlainText(row.part) : null);
  }

  const answerRows =
    questionRows.length === 0
      ? []
      : await db
          .select({ contentBlockId: responses.contentBlockId, answerText: responses.answerText })
          .from(responses)
          .where(and(eq(responses.userId, userId), inArray(responses.contentBlockId, questionRows.map((q) => q.id))));
  const answerByBlockId = new Map(answerRows.map((r) => [r.contentBlockId, r.answerText ?? ""]));

  const contents: BookContentsRow[] = [];
  const journal: BookJournalChapter[] = [];
  let chaptersRead = 0;
  let totalChapters = 0;

  for (const lesson of lessons) {
    const label = parseBookLessonTitle(lesson.title);
    const href = `${studyHref}/${lesson.id}`;
    const status = statusByLessonId.get(lesson.id) ?? "not_started";
    const locked = isLocked(lesson);
    const isChapter = label?.kind === "chapter" || label?.kind === "epilogue";
    if (isChapter && !locked) {
      totalChapters++;
      if (status === "completed") chaptersRead++;
    }
    contents.push({
      lessonId: lesson.id,
      href,
      label: label?.label ?? lesson.title,
      title: label && label.kind !== "introduction" ? label.title : null,
      part: partByLessonId.get(lesson.id) ?? null,
      status,
      isCurrent: lesson.id === currentLessonId,
      locked,
    });

    const answers = questionRows
      .filter((q) => q.lessonId === lesson.id)
      .map((q) => ({ question: q.questionPrompt ?? "", answer: answerByBlockId.get(q.id) ?? "" }))
      .filter((a) => a.answer.trim());
    if (answers.length > 0) {
      journal.push({
        lessonId: lesson.id,
        href,
        label: label?.label ?? lesson.title,
        title: label && label.kind !== "introduction" ? label.title : null,
        answers,
      });
    }
  }

  return { contents, journal, hasQuestions: questionRows.length > 0, chaptersRead, totalChapters };
}

/**
 * Splits the current lesson's blocks into what the chapter view shows: the
 * opener and text (first text block), the "To Sit With" questions, the
 * closing blessing (the last callout), and anything else an admin added.
 */
export function bookChapterParts(blocks: ContentBlockData[]): {
  textBlock: ContentBlockData | undefined;
  chapter: ParsedBookChapter | null;
  questions: ContentBlockData[];
  blessing: ContentBlockData | undefined;
  extra: ContentBlockData[];
} {
  const textBlock = blocks.find((b) => b.type === "text");
  const questions = blocks.filter((b) => b.type === "question");
  const callouts = blocks.filter((b) => b.type === "callout");
  const blessing = callouts[callouts.length - 1];
  const extra = blocks.filter((b) => b !== textBlock && b.type !== "question" && b !== blessing);
  return {
    textBlock,
    chapter: textBlock?.body ? parseBookChapterHtml(textBlock.body) : null,
    questions,
    blessing,
    extra,
  };
}
