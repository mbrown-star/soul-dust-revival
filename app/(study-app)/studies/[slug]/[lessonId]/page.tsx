import { getDb } from "@/lib/db/client";
import { studies, lessons, contentBlocks, products, lessonProgress, responses } from "@/lib/db/schema";
import { eq, asc, and, inArray } from "drizzle-orm";
import { hasEntitlement } from "@/lib/entitlements/check";
import { getSession } from "@/lib/auth/session";
import { LessonBlock } from "@/components/study/LessonBlock";
import { LessonNavigation } from "@/components/study/LessonNavigation";
import { StudyLessonView } from "@/components/study/StudyLessonView";
import { DevotionalAppView } from "@/components/devotional/DevotionalAppView";
import { parseDayLabel, todaysDateLabel } from "@/lib/devotional/parseDayLabel";
import type { YearDay } from "@/components/devotional/YearView";
import type { JournalEntry } from "@/components/devotional/JournalView";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

// Mirrors the page's own entitlement check rather than just looking the
// lesson up directly -- metadata generation runs independently of the page
// body, so a naive lookup would leak a gated lesson's real title into the
// page <title>/browser tab for a visitor who isn't logged in or doesn't have
// access to it, even though the page itself correctly redirects them away.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}): Promise<Metadata> {
  const { slug, lessonId } = await params;
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  if (!study) return { title: "Studies" };

  const session = await getSession();
  if (!session) return { title: "Studies" };

  const allowed = await hasEntitlement(session.userId, study.productId);
  if (!allowed) return { title: "Studies" };

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  return { title: lesson?.title ?? "Studies" };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  if (!study) redirect("/studies");

  const session = await getSession();
  if (!session) redirect(`/login?next=/studies/${slug}/${lessonId}`);

  const allowed = await hasEntitlement(session.userId, study.productId);
  if (!allowed) {
    // Look up the linked product's own slug — a study's slug and its linked
    // product's slug are two different fields on two different rows and are
    // never guaranteed to match, so reusing the study's slug here would send
    // people to the wrong (or a nonexistent) product page.
    const product = await db.query.products.findFirst({ where: eq(products.id, study.productId) });
    redirect(product ? `/books/${product.slug}` : "/books");
  }

  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, lessonId) });
  if (!lesson) redirect(`/studies/${slug}`);

  // A study's own title isn't always a clean display name (some were
  // imported with the raw source filename left in place) -- its linked
  // product's title is the one actually shown on the storefront, so the
  // devotional app shell's header uses that instead.
  const displayStudyTitle = study.kind === "devotional"
    ? (await db.query.products.findFirst({ where: eq(products.id, study.productId) }))?.title ?? study.title
    : study.title;

  // Needed for previous/next navigation and the "back to contents" link --
  // same published-only ordering the study's own listing page uses.
  const studyLessons = await db
    .select({ id: lessons.id, title: lessons.title, orderIndex: lessons.orderIndex })
    .from(lessons)
    .where(and(eq(lessons.studyId, study.id), eq(lessons.published, true)))
    .orderBy(asc(lessons.orderIndex));
  const currentIndex = studyLessons.findIndex((l) => l.id === lesson.id);
  const previousLesson = currentIndex > 0 ? studyLessons[currentIndex - 1] : undefined;
  const nextLesson = currentIndex >= 0 && currentIndex < studyLessons.length - 1 ? studyLessons[currentIndex + 1] : undefined;

  const blocks = await db
    .select()
    .from(contentBlocks)
    .where(eq(contentBlocks.lessonId, lesson.id))
    .orderBy(asc(contentBlocks.orderIndex));

  const [progressRow] = await db
    .select({ status: lessonProgress.status })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, session.userId), eq(lessonProgress.lessonId, lesson.id)))
    .limit(1);

  // A Study lesson's question blocks need the user's previously saved answer
  // shown back to them, not a blank field every time they revisit.
  const questionBlockIds = blocks.filter((b) => b.type === "question").map((b) => b.id);
  const savedAnswers =
    questionBlockIds.length === 0
      ? []
      : await db
          .select({ contentBlockId: responses.contentBlockId, answerText: responses.answerText })
          .from(responses)
          .where(and(eq(responses.userId, session.userId), inArray(responses.contentBlockId, questionBlockIds)));
  const answerByBlockId = new Map(savedAnswers.map((r) => [r.contentBlockId, r.answerText ?? ""]));

  const studyHref = `/studies/${slug}`;
  const previousHref = previousLesson ? `${studyHref}/${previousLesson.id}` : null;
  const nextHref = nextLesson ? `${studyHref}/${nextLesson.id}` : null;
  const isDevotional = study.kind === "devotional";
  // A Study-kind lesson without studyContent (the "Introduction" lesson, or
  // any lesson imported before the interactive Study reader existed) falls
  // back to the plain content-block reading view below.
  const hasCustomHeader = isDevotional || !!lesson.studyContent;

  // The devotional's own 4-view app shell (Today / The Year / Journal / Six
  // Faces of the Dust -- see DevotionalAppView) needs every day's own
  // walked/answered status, not just the current one. All three extra
  // queries below are scoped to this one study's lessons and this one
  // user, bounded by the study's fixed lesson count (hundreds of rows at
  // most for a year-long devotional) -- not per-lesson round trips.
  let devotionalProps: {
    totalDays: number;
    daysWalked: number;
    yearDays: YearDay[];
    journalEntries: JournalEntry[];
    questionBlockId: string | null;
    todayAnswer: string | undefined;
    pickUpWithToday: { href: string } | null;
  } | null = null;

  if (isDevotional) {
    const lessonIds = studyLessons.map((l) => l.id);

    const progressRows =
      lessonIds.length === 0
        ? []
        : await db
            .select({ lessonId: lessonProgress.lessonId, status: lessonProgress.status })
            .from(lessonProgress)
            .where(and(eq(lessonProgress.userId, session.userId), inArray(lessonProgress.lessonId, lessonIds)));
    const statusByLessonId = new Map(progressRows.map((r) => [r.lessonId, r.status]));

    const questionRows =
      lessonIds.length === 0
        ? []
        : await db
            .select({ id: contentBlocks.id, lessonId: contentBlocks.lessonId, questionPrompt: contentBlocks.questionPrompt })
            .from(contentBlocks)
            .where(and(inArray(contentBlocks.lessonId, lessonIds), eq(contentBlocks.type, "question")));
    const questionBlockByLessonId = new Map(questionRows.map((r) => [r.lessonId, r]));

    const questionBlockIds = questionRows.map((r) => r.id);
    const devotionalAnswerRows =
      questionBlockIds.length === 0
        ? []
        : await db
            .select({ contentBlockId: responses.contentBlockId, answerText: responses.answerText })
            .from(responses)
            .where(and(eq(responses.userId, session.userId), inArray(responses.contentBlockId, questionBlockIds)));
    const answerByQuestionBlockId = new Map(devotionalAnswerRows.map((r) => [r.contentBlockId, r.answerText ?? ""]));

    const todayLabel = todaysDateLabel();
    const yearDays: YearDay[] = [];
    const journalEntries: JournalEntry[] = [];
    let todayLessonId: string | null = null;

    for (const l of studyLessons) {
      const parsed = parseDayLabel(l.title);
      if (!parsed) continue; // the "Introduction" lesson, or a hand-edited title
      if (parsed.date === todayLabel) todayLessonId = l.id;

      const questionBlock = questionBlockByLessonId.get(l.id);
      const answer = questionBlock ? answerByQuestionBlockId.get(questionBlock.id) : undefined;
      const answered = !!answer?.trim();
      const href = `${studyHref}/${l.id}`;

      yearDays.push({
        lessonId: l.id,
        href,
        day: parsed.day,
        date: parsed.date,
        month: parsed.month,
        dateNum: parsed.dateNum,
        psalmRef: parsed.psalmRef,
        psalmNumber: parsed.psalmNumber,
        title: l.title,
        walked: statusByLessonId.get(l.id) === "completed",
        answered,
        isToday: parsed.date === todayLabel,
      });

      if (answered && questionBlock) {
        journalEntries.push({
          lessonId: l.id,
          href,
          day: parsed.day,
          date: parsed.date,
          psalmRef: parsed.psalmRef,
          question: questionBlock.questionPrompt ?? "",
          answer: answer!,
        });
      }
    }

    const currentQuestionBlock = questionBlockByLessonId.get(lesson.id) ?? null;

    devotionalProps = {
      totalDays: yearDays.length,
      daysWalked: yearDays.filter((d) => d.walked).length,
      yearDays,
      journalEntries,
      questionBlockId: currentQuestionBlock?.id ?? null,
      todayAnswer: currentQuestionBlock ? answerByQuestionBlockId.get(currentQuestionBlock.id) : undefined,
      pickUpWithToday:
        todayLessonId && todayLessonId !== lesson.id ? { href: `${studyHref}/${todayLessonId}` } : null,
    };
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10 space-y-8 study-content-protected">
      <LessonNavigation
        studyHref={studyHref}
        studyTitle={study.title}
        lessonId={lesson.id}
        initialStatus={progressRow?.status ?? "not_started"}
        previousHref={previousHref}
        nextHref={nextHref}
        position="top"
        visible={!hasCustomHeader}
      />
      {isDevotional && devotionalProps ? (
        <DevotionalAppView
          studyTitle={displayStudyTitle}
          studyHref={studyHref}
          totalDays={devotionalProps.totalDays}
          daysWalked={devotionalProps.daysWalked}
          yearDays={devotionalProps.yearDays}
          journalEntries={devotionalProps.journalEntries}
          today={{
            dayLabel: lesson.title,
            bodyHtml: blocks.find((b) => b.type === "text")?.body ?? "",
            previousHref,
            nextHref,
            lessonId: lesson.id,
            questionBlockId: devotionalProps.questionBlockId,
            initialAnswer: devotionalProps.todayAnswer,
            initialWalked: progressRow?.status === "completed",
            pickUpWithToday: devotionalProps.pickUpWithToday,
          }}
        />
      ) : lesson.studyContent ? (
        <StudyLessonView
          key={lesson.id}
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          content={lesson.studyContent}
          initialAnswers={Object.fromEntries(answerByBlockId)}
          previousHref={previousHref}
          nextHref={nextHref}
          bookLabel={study.title}
          weeks={studyLessons.map((l) => ({ id: l.id, title: l.title, href: `${studyHref}/${l.id}`, isCurrent: l.id === lesson.id }))}
        />
      ) : (
        <>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">{lesson.title}</h1>
          {blocks.map((block) => (
            <LessonBlock key={block.id} block={block} initialAnswer={answerByBlockId.get(block.id)} />
          ))}
        </>
      )}
      {/* Only rendered by print CSS — invisible on screen (see globals.css). */}
      <p className="print-only-notice">
        Study content isn&apos;t available to print from the web app. If you&apos;d like a
        printed copy, the physical book is available at /books.
      </p>
      <LessonNavigation
        studyHref={studyHref}
        studyTitle={study.title}
        lessonId={lesson.id}
        initialStatus={progressRow?.status ?? "not_started"}
        previousHref={previousHref}
        nextHref={nextHref}
        position="bottom"
        // DevotionalAppView's own WalkedToggle already marks real completion
        // (the same lesson_progress write this control makes) with a
        // toggle-in-place interaction that fits staying on one day to reread
        // or answer, rather than this control's mark-and-auto-navigate-to-
        // next one -- showing both would be two controls for one action.
        visible={!isDevotional}
      />
    </div>
  );
}
