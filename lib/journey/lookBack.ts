import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { contentBlocks, lessons, responses } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { readerContent, toBlockData } from "@/lib/lessons/publishedContent";
import type { JourneyProgress } from "./load";

type Db = Awaited<ReturnType<typeof getDb>>;

export type LookBackWeek = {
  lessonId: string;
  label: string;
  title: string;
  href: string;
  answers: { prompt: string; answer: string }[];
};

export type LookBack = { partLabel: string; weeks: LookBackWeek[] };

/**
 * What a reader wrote in one Part of the Journey, week by week: each saved
 * answer next to the question as readers see it (a published week's
 * snapshot, never unpublished changes). Weeks with no answers are left out.
 * Bounded by one Part: about a dozen lessons and three queries.
 */
export async function loadLookBack(db: Db, progress: JourneyProgress, partIndex: number, userId: string): Promise<LookBack | null> {
  const part = progress.parts[partIndex];
  if (!part) return null;
  const weeks = progress.stops.filter((s) => s.partIndex === partIndex && !s.isThreshold);
  const lessonIds = weeks.map((w) => w.lessonId);
  if (lessonIds.length === 0) return { partLabel: part.label, weeks: [] };

  const [lessonRows, questionRows] = await Promise.all([
    db
      .select({
        id: lessons.id,
        publishedContent: lessons.publishedContent,
        studyContent: lessons.studyContent,
        hasDraftChanges: lessons.hasDraftChanges,
      })
      .from(lessons)
      .where(inArray(lessons.id, lessonIds)),
    db
      .select()
      .from(contentBlocks)
      .where(and(inArray(contentBlocks.lessonId, lessonIds), eq(contentBlocks.type, "question"), isNull(contentBlocks.removedAt)))
      .orderBy(asc(contentBlocks.orderIndex)),
  ]);

  const questionsByLesson = new Map<string, { id: string; prompt: string }[]>();
  for (const row of lessonRows) {
    const working = questionRows.filter((q) => q.lessonId === row.id).map(toBlockData);
    const shown = readerContent(row, working, { draftPreview: false }).blocks.filter((b) => b.type === "question");
    questionsByLesson.set(
      row.id,
      shown.map((b) => ({ id: b.id, prompt: b.questionPrompt ?? "" }))
    );
  }

  const blockIds = [...questionsByLesson.values()].flat().map((q) => q.id);
  const answerRows =
    blockIds.length === 0
      ? []
      : await db
          .select({ contentBlockId: responses.contentBlockId, answerText: responses.answerText })
          .from(responses)
          .where(and(eq(responses.userId, userId), inArray(responses.contentBlockId, blockIds)));
  const answerByBlock = new Map(answerRows.map((r) => [r.contentBlockId, r.answerText?.trim() ?? ""]));

  return {
    partLabel: part.label,
    weeks: weeks
      .map((w) => ({
        lessonId: w.lessonId,
        label: w.label,
        title: w.title,
        href: w.href,
        answers: (questionsByLesson.get(w.lessonId) ?? [])
          .map((q) => ({ prompt: q.prompt, answer: answerByBlock.get(q.id) ?? "" }))
          .filter((a) => a.answer !== ""),
      }))
      .filter((w) => w.answers.length > 0),
  };
}
