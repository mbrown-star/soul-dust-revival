import { getDb } from "@/lib/db/client";
import { studies, lessons, contentBlocks, products, lessonProgress, responses } from "@/lib/db/schema";
import { eq, asc, and, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { readerContent, toBlockData, workingBlockRows } from "@/lib/lessons/publishedContent";
import { getLessonAccess, studyHasOpenSample } from "@/lib/entitlements/check";
import { isSneakPeek } from "@/lib/launchMode";
import { shortLessonLabel } from "@/lib/study/shortLessonLabel";
import { studyKindLabel } from "@/lib/study/studyKindLabel";
import { LockedNextLesson } from "@/components/study/LockedNextLesson";
import { getSession } from "@/lib/auth/session";
import { LessonBlock } from "@/components/study/LessonBlock";
import { LessonNavigation } from "@/components/study/LessonNavigation";
import { StudyLessonView } from "@/components/study/StudyLessonView";
import { WeekMediaList } from "@/components/study/WeekMediaList";
import { weekMediaBySlot } from "@/lib/study/weekMedia";
import { DevotionalAppView } from "@/components/devotional/DevotionalAppView";
import { formatReadings, parseDayLabel, todaysDateLabel } from "@/lib/devotional/parseDayLabel";
import { isReadingsLine } from "@/lib/devotional/parseDevotionalHtml";
import { devotionalDayTabTitle } from "@/lib/devotional/dayTabTitle";
import { htmlToPlainText } from "@/lib/content/plainText";
import { getDisplayStudyTitle } from "@/lib/study/displayTitle";
import type { YearDay } from "@/components/devotional/YearView";
import type { JournalEntry } from "@/components/devotional/JournalView";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getJourneyForStudy, loadJourneyMap, loadJourneyProgress } from "@/lib/journey/load";
import { journeyLessonNav } from "@/lib/journey/nav";
import { loadLookBack } from "@/lib/journey/lookBack";
import { CompleteStopButton } from "@/components/journey/CompleteStopButton";
import { LookBackList } from "@/components/journey/LookBackList";
import { JourneyNextStopNote } from "@/components/journey/JourneyNextStopNote";
import { IntroTabs } from "@/components/study/IntroTabs";
import { splitIntroSections } from "@/lib/study/introSections";
import { sanitizeHtml } from "@/lib/sanitize/html";
import { BookAppView } from "@/components/book/BookAppView";
import { BookChapterView } from "@/components/book/BookChapterView";
import { BookContents } from "@/components/book/BookContents";
import { BookJournal } from "@/components/book/BookJournal";
import { bookChapterParts, loadBookOverview } from "@/lib/book/loadBookReader";
import { parseBookLessonTitle } from "@/lib/book/chapterHtml";
import type { Metadata } from "next";
import { z } from "zod";

const isUuid = (value: string) => z.string().uuid().safeParse(value).success;

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

  if (!isUuid(lessonId)) return { title: "Studies" };
  const lesson = await db.query.lessons.findFirst({ where: and(eq(lessons.id, lessonId), eq(lessons.studyId, study.id)) });
  if (!lesson) return { title: "Studies" };

  const access = await getLessonAccess(session, study, lesson);
  if (!access.allowed || (!access.isAdminPreview && (!lesson.published || !study.published))) return { title: "Studies" };
  // A Journey Part's introduction is its threshold: name the Part, not just
  // "Introduction" (every threshold's tab read the same).
  if (lesson.title.trim().toLowerCase() === "introduction") {
    const journey = await getJourneyForStudy(db, study.id);
    const part = journey ? (await loadJourneyMap(db, journey)).parts.find((p) => p.studyId === study.id) : undefined;
    if (journey && part) return { title: `${part.shortLabel} introduction · ${journey.title}` };
  }
  if (study.kind === "devotional" && parseDayLabel(lesson.title)) {
    // The day's own title is in its text block: the published snapshot's
    // when there is one (what readers see), else the working copy.
    const snapshotText = lesson.publishedContent?.blocks.find((b) => b.type === "text")?.body;
    const dayHtml =
      snapshotText ??
      (
        await db
          .select({ body: contentBlocks.body })
          .from(contentBlocks)
          .where(and(eq(contentBlocks.lessonId, lesson.id), eq(contentBlocks.type, "text"), isNull(contentBlocks.removedAt)))
          .orderBy(asc(contentBlocks.orderIndex))
          .limit(1)
      )[0]?.body;
    return { title: devotionalDayTabTitle(lesson.title, dayHtml) };
  }
  return { title: lesson.title };
}

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const { slug, lessonId } = await params;
  const { draft } = await searchParams;
  const db = await getDb();

  const study = await db.query.studies.findFirst({ where: eq(studies.slug, slug) });
  if (!study) redirect("/studies");

  const session = await getSession();
  if (!session) redirect(`/login?next=/studies/${slug}/${lessonId}`);

  // A malformed id in the URL is "no such lesson", not a database error.
  if (!isUuid(lessonId)) redirect(`/studies/${slug}`);
  // Scoped to this study: access is checked against *this* study's product,
  // so a lesson id from a different study must not load here.
  const lesson = await db.query.lessons.findFirst({ where: and(eq(lessons.id, lessonId), eq(lessons.studyId, study.id)) });
  if (!lesson) redirect(`/studies/${slug}`);

  const access = await getLessonAccess(session, study, lesson);
  // An owner whose Journey stop isn't open yet goes to the Journey home,
  // which says when it opens.
  if (access.journeyLock) redirect(access.journeyLock.journeyHref);
  if (!access.allowed) {
    // A study with a free sample: back to its lesson list, which shows which
    // lessons are open and which are locked.
    if (await studyHasOpenSample(study)) redirect(`/studies/${slug}`);
    // Otherwise the linked product's page. Look up the product's own slug --
    // a study's slug and its linked product's slug are two different fields
    // on two different rows and are never guaranteed to match.
    const product = await db.query.products.findFirst({ where: eq(products.id, study.productId) });
    redirect(product ? `/store/${product.slug}` : "/store");
  }

  // Drafts (an unpublished lesson or study) are visible only to an admin
  // previewing them.
  if (!access.isAdminPreview && (!lesson.published || !study.published)) redirect(`/studies/${slug}`);
  const isDraftPreview = !lesson.published || !study.published;

  // A study's own title isn't always a clean display name (some were
  // imported with the raw source filename left in place) -- its linked
  // product's title is the one actually shown on the storefront, so the
  // devotional app shell's header and the "back to {study}" nav links below
  // use that instead. Not used for StudyLessonView's `bookLabel` prop (see
  // lib/study/displayTitle.ts) -- that one intentionally keeps study.title's
  // own "Soul Dust Revival X" convention, which deriveBookLabel() strips.
  const displayStudyTitle = await getDisplayStudyTitle(db, study);

  // Needed for previous/next navigation and the "back to contents" link --
  // same published-only ordering the study's own listing page uses.
  // An admin previewing an unpublished study steps through its draft lessons
  // too (see the study page), so an imported study can be reviewed in order.
  const showDrafts = !study.published && access.isAdminPreview;
  const studyLessons = await db
    .select({ id: lessons.id, title: lessons.title, orderIndex: lessons.orderIndex, isSample: lessons.isSample })
    .from(lessons)
    .where(showDrafts ? eq(lessons.studyId, study.id) : and(eq(lessons.studyId, study.id), eq(lessons.published, true)))
    .orderBy(asc(lessons.orderIndex));
  // A free-sample reader sees the whole study's lesson list, but only its
  // sample lessons are links; navigation never leads into a locked one.
  const isLocked = (l: { isSample: boolean }) => access.sampleOnly && !l.isSample;
  const currentIndex = studyLessons.findIndex((l) => l.id === lesson.id);
  const previousLesson = currentIndex > 0 ? studyLessons[currentIndex - 1] : undefined;
  const nextLesson = currentIndex >= 0 && currentIndex < studyLessons.length - 1 ? studyLessons[currentIndex + 1] : undefined;
  const lockedNextLesson = nextLesson && isLocked(nextLesson) ? nextLesson : undefined;
  // Sample lessons needn't be consecutive: only call this the end of the
  // sample when no later lesson is still open.
  const laterOpenLesson = studyLessons.slice(currentIndex + 1).some((l) => !isLocked(l));
  const productHrefForLocked =
    lockedNextLesson && !isSneakPeek()
      ? await db.query.products
          .findFirst({ where: eq(products.id, study.productId), columns: { slug: true, active: true } })
          .then((p) => (p?.active ? `/store/${p.slug}` : null))
      : null;

  // Readers see a published lesson's published snapshot; the builder's
  // unpublished changes show only to an admin who asks (?draft=1, the
  // builder's "Preview as reader" link while changes are pending).
  const content = readerContent(
    lesson,
    (await workingBlockRows(db, lesson.id)).map(toBlockData),
    { draftPreview: access.isAdminPreview && draft === "1" }
  );
  const blocks = content.blocks;
  const studyContent = content.studyContent;

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

  // A Part of The Journey reads as one year-long road: navigation runs
  // across Parts and only to stops that are open (lib/journey/nav.ts).
  // getLessonAccess already loaded it for a reader who owns the Journey;
  // an admin previewing gets it laid out unlocked.
  const adminJourney = access.isAdminPreview ? await getJourneyForStudy(db, study.id) : null;
  const journeyProgress =
    access.journey ?? (adminJourney ? await loadJourneyProgress(db, adminJourney, session.userId) : null);
  const journeyNav = journeyProgress ? journeyLessonNav(journeyProgress, lesson.id, access.isAdminPreview) : null;
  const lookBack =
    journeyProgress && journeyNav?.stop.isThreshold && journeyNav.part.index > 0
      ? await loadLookBack(db, journeyProgress, journeyNav.part.index - 1, session.userId)
      : null;

  const studyHref = journeyNav?.homeHref ?? `/studies/${slug}`;
  const previousHref = journeyNav
    ? journeyNav.previousHref
    : previousLesson && !isLocked(previousLesson)
      ? `${studyHref}/${previousLesson.id}`
      : null;
  const nextHref = journeyNav
    ? journeyNav.nextHref
    : nextLesson && !isLocked(nextLesson)
      ? `${studyHref}/${nextLesson.id}`
      : null;
  const isDevotional = study.kind === "devotional";
  // A book (Revive Me) reads in its own shell: Read / Contents / Journal.
  const isBook = study.kind === "book";
  // A Study-kind lesson without studyContent (the "Introduction" lesson, or
  // any lesson imported before the interactive Study reader existed) falls
  // back to the plain content-block reading view below.
  const hasCustomHeader = isDevotional || isBook || !!studyContent;
  const bookOverview = isBook
    ? await loadBookOverview(db, {
        lessons: studyLessons,
        userId: session.userId,
        studyHref,
        currentLessonId: lesson.id,
        isLocked,
      })
    : null;

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
    psalmsEdition: boolean;
    hasQuestions: boolean;
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
            .where(and(inArray(contentBlocks.lessonId, lessonIds), eq(contentBlocks.type, "question"), isNull(contentBlocks.removedAt)))
            .orderBy(asc(contentBlocks.orderIndex));
    // A day's "Question to Sit With" is its first question block. Any other
    // question an admin added is shown as an extra block after the day, so it
    // must not take over this slot (and the reader's saved answer with it).
    const questionBlockByLessonId = new Map<string, { id: string; questionPrompt: string | null }>();
    for (const row of questionRows) {
      if (!questionBlockByLessonId.has(row.lessonId)) questionBlockByLessonId.set(row.lessonId, row);
    }
    // A published day an admin has edited shows readers its published
    // snapshot, so its question (wording and answer slot) comes from there --
    // never from unpublished changes. Only the first question block is
    // pulled out of each snapshot, not the whole day.
    const publishedQuestions =
      lessonIds.length === 0
        ? []
        : await db
            .select({
              lessonId: lessons.id,
              question: sql<{ id: string; questionPrompt: string | null } | null>`jsonb_path_query_first(${lessons.publishedContent}, '$.blocks[*] ? (@.type == "question")')`,
            })
            .from(lessons)
            .where(and(inArray(lessons.id, lessonIds), isNotNull(lessons.publishedContent)));
    for (const { lessonId: id, question } of publishedQuestions) {
      if (question) questionBlockByLessonId.set(id, { id: question.id, questionPrompt: question.questionPrompt });
      else questionBlockByLessonId.delete(id);
    }

    const questionBlockIds = [...questionBlockByLessonId.values()].map((q) => q.id);
    const devotionalAnswerRows =
      questionBlockIds.length === 0
        ? []
        : await db
            .select({ contentBlockId: responses.contentBlockId, answerText: responses.answerText })
            .from(responses)
            .where(and(eq(responses.userId, session.userId), inArray(responses.contentBlockId, questionBlockIds)));
    const answerByQuestionBlockId = new Map(devotionalAnswerRows.map((r) => [r.contentBlockId, r.answerText ?? ""]));

    // A day whose label names no reading ("DAY 1 · JANUARY 1", A 365-Day
    // Journey Through the Bible) opens with its readings instead, as the
    // first bold line of its text. Pulled out in SQL so the Year view can show
    // and search them without loading every day's whole text.
    const parsedLabels = new Map(studyLessons.map((l) => [l.id, parseDayLabel(l.title)]));
    const needReadings = [...parsedLabels].filter(([, p]) => p && !p.reading).map(([id]) => id);
    const readingRows =
      needReadings.length === 0
        ? []
        : await db
            .select({
              lessonId: contentBlocks.lessonId,
              firstLine: sql<string | null>`substring(${contentBlocks.body} from '^<p><strong>([^<]{6,160})</strong></p>')`,
            })
            .from(contentBlocks)
            .where(and(inArray(contentBlocks.lessonId, needReadings), eq(contentBlocks.type, "text"), isNull(contentBlocks.removedAt)))
            .orderBy(asc(contentBlocks.orderIndex));
    const readingByLessonId = new Map<string, string | null>();
    for (const row of readingRows) {
      if (readingByLessonId.has(row.lessonId)) continue;
      const line = row.firstLine ? htmlToPlainText(row.firstLine) : "";
      readingByLessonId.set(row.lessonId, isReadingsLine(line) ? formatReadings(line) : null);
    }

    const todayLabel = todaysDateLabel();
    const yearDays: YearDay[] = [];
    const journalEntries: JournalEntry[] = [];
    let todayLessonId: string | null = null;

    for (const l of studyLessons) {
      const parsed = parsedLabels.get(l.id);
      if (!parsed) continue; // the "Introduction" lesson, or a hand-edited title
      const reading = parsed.reading ?? readingByLessonId.get(l.id) ?? null;
      const locked = isLocked(l);
      if (parsed.date === todayLabel && !locked) todayLessonId = l.id;

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
        reading,
        psalmNumber: parsed.psalmNumber,
        title: l.title,
        walked: statusByLessonId.get(l.id) === "completed",
        answered,
        isToday: parsed.date === todayLabel,
        locked,
      });

      if (answered && questionBlock) {
        journalEntries.push({
          lessonId: l.id,
          href,
          day: parsed.day,
          date: parsed.date,
          reading,
          question: questionBlock.questionPrompt ?? "",
          answer: answer!,
        });
      }
    }

    // Today's own question comes from the content being shown (published
    // snapshot or draft preview), not the working rows used for the other days.
    const currentQuestionBlock = blocks.find((b) => b.type === "question") ?? null;

    devotionalProps = {
      // A sample reader's ring counts only the days they can open.
      totalDays: yearDays.filter((d) => !d.locked).length,
      daysWalked: yearDays.filter((d) => d.walked && !d.locked).length,
      yearDays,
      journalEntries,
      // The Psalms devotional (its labels name a psalm a day) has its own
      // edition line and "Six Faces of the Dust" essay; other devotionals don't.
      psalmsEdition: yearDays.some((d) => d.psalmNumber !== null),
      // No day has an answerable question: no Journal tab, no answer count.
      hasQuestions: questionBlockByLessonId.size > 0,
      questionBlockId: currentQuestionBlock?.id ?? null,
      todayAnswer: currentQuestionBlock ? answerByBlockId.get(currentQuestionBlock.id) : undefined,
      pickUpWithToday:
        todayLessonId && todayLessonId !== lesson.id ? { href: `${studyHref}/${todayLessonId}` } : null,
    };
  }

  // An introduction (a study's or devotional's, or a Journey threshold) reads
  // as tabs, one per section (Foreword, Preface, …), when its first text
  // block has more than one. See lib/import/introHeadings.ts for how
  // imported introductions get their sections.
  const isIntroduction = journeyNav?.stop.isThreshold || lesson.title.trim().toLowerCase() === "introduction";
  const introBlock = isIntroduction ? blocks.find((b) => b.type === "text") : undefined;
  const introSections = introBlock ? splitIntroSections(sanitizeHtml(introBlock.body ?? "")) : [];
  const introTabs =
    introSections.length > 0 ? (
      <IntroTabs
        sections={introSections.map((section) => ({
          title: section.title,
          // Sanitized again after the split, so each section's HTML stands
          // on its own (balanced tags) as well as being safe.
          content: <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.html) }} />,
        }))}
      />
    ) : null;
  // The lesson's other blocks, without the one the tabs already show.
  const blocksBesideIntro = introTabs ? blocks.filter((block) => block.id !== introBlock?.id) : blocks;

  // A book chapter's opener, text, questions and blessing (see
  // lib/book/chapterHtml.ts); the Introduction reads as its Foreword/Preface tabs.
  function renderBookChapter() {
    const label = parseBookLessonTitle(lesson!.title);
    const isChapter = label?.kind === "chapter" || label?.kind === "epilogue";
    const parts = bookChapterParts(blocks);
    const chapter = isChapter ? parts.chapter : null;
    const navFor = (l: (typeof studyLessons)[number] | undefined) =>
      l && !isLocked(l) ? { href: `${studyHref}/${l.id}`, label: parseBookLessonTitle(l.title)?.label ?? l.title } : null;
    return (
      <BookChapterView
        key={lesson!.id}
        label={label?.label ?? lesson!.title}
        chapter={chapter ? { ...chapter, bodyHtml: sanitizeHtml(chapter.bodyHtml) } : null}
        html={sanitizeHtml(parts.textBlock?.body ?? "")}
        introContent={label?.kind === "introduction" ? introTabs ?? undefined : undefined}
        questions={parts.questions.map((q) => ({
          id: q.id,
          prompt: q.questionPrompt ?? "",
          initialAnswer: answerByBlockId.get(q.id),
        }))}
        blessing={
          parts.blessing
            ? { title: parts.blessing.calloutTitle || "Lift Up Your Eyes", html: sanitizeHtml(parts.blessing.body ?? "") }
            : null
        }
        extraContent={
          parts.extra.length > 0 ? (
            <div className="space-y-8">
              {parts.extra.map((block) => (
                <LessonBlock key={block.id} block={block} initialAnswer={answerByBlockId.get(block.id)} />
              ))}
            </div>
          ) : undefined
        }
        lessonId={lesson!.id}
        initialRead={progressRow?.status === "completed"}
        previous={navFor(previousLesson)}
        next={navFor(nextLesson)}
      />
    );
  }

  // A devotional day's printed parts come from its first text block (and its
  // "question to sit with" answer block); anything else the admin added is
  // shown after them, in the builder's order.
  const dayTextBlock = isDevotional ? blocks.find((b) => b.type === "text") : undefined;
  const devotionalExtraBlocks = isDevotional
    ? blocks.filter((b) => b.id !== dayTextBlock?.id && b.id !== devotionalProps?.questionBlockId)
    : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10 space-y-8 study-content-protected">
      {isDraftPreview ? (
        <p role="status" className="text-sm rounded-lg bg-gold/20 text-ink px-4 py-2">
          Admin preview: this {study.published ? "lesson" : "study"} is a draft, so readers can&apos;t see it yet.
        </p>
      ) : content.isDraftPreview ? (
        <p role="status" className="text-sm rounded-lg bg-gold/20 text-ink px-4 py-2">
          Admin preview: unpublished changes. Readers still see the published version until you publish these changes.
        </p>
      ) : null}
      <LessonNavigation
        studyHref={studyHref}
        studyTitle={journeyNav ? "The Journey" : displayStudyTitle}
        lessonId={lesson.id}
        initialStatus={progressRow?.status ?? "not_started"}
        previousHref={previousHref}
        nextHref={nextHref}
        position="top"
        visible={!hasCustomHeader && !journeyNav?.stop.isThreshold}
      />
      {isDevotional && devotionalProps ? (
        <DevotionalAppView
          studyTitle={displayStudyTitle}
          studyHref={studyHref}
          totalDays={devotionalProps.totalDays}
          daysWalked={devotionalProps.daysWalked}
          yearDays={devotionalProps.yearDays}
          journalEntries={devotionalProps.journalEntries}
          psalmsEdition={devotionalProps.psalmsEdition}
          hasQuestions={devotionalProps.hasQuestions}
          today={{
            dayLabel: lesson.title,
            bodyHtml: dayTextBlock?.body ?? "",
            content: introTabs,
            previousHref,
            nextHref,
            lessonId: lesson.id,
            questionBlockId: devotionalProps.questionBlockId,
            initialAnswer: devotionalProps.todayAnswer,
            initialWalked: progressRow?.status === "completed",
            pickUpWithToday: devotionalProps.pickUpWithToday,
            extraContent:
              devotionalExtraBlocks.length > 0 ? (
                <div className="space-y-8">
                  {devotionalExtraBlocks.map((block) => (
                    <LessonBlock key={block.id} block={block} initialAnswer={answerByBlockId.get(block.id)} />
                  ))}
                </div>
              ) : null,
          }}
        />
      ) : isBook && bookOverview ? (
        <BookAppView
          title={displayStudyTitle}
          studyHref={studyHref}
          chaptersRead={bookOverview.chaptersRead}
          totalChapters={bookOverview.totalChapters}
          read={renderBookChapter()}
          contents={<BookContents rows={bookOverview.contents} />}
          journal={bookOverview.hasQuestions ? <BookJournal chapters={bookOverview.journal} /> : null}
        />
      ) : studyContent ? (
        <StudyLessonView
          key={lesson.id}
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          content={studyContent}
          initialAnswers={Object.fromEntries(answerByBlockId)}
          previousHref={previousHref}
          nextHref={nextHref}
          bookLabel={study.title}
          weeks={
            journeyNav
              ? journeyNav.pickerItems
              : studyLessons.map((l) => ({
                  id: l.id,
                  title: l.title,
                  href: `${studyHref}/${l.id}`,
                  isCurrent: l.id === lesson.id,
                  locked: isLocked(l),
                }))
          }
          journey={
            journeyNav
              ? {
                  homeHref: journeyNav.homeHref,
                  breadcrumb: `The Journey · ${journeyNav.part.shortLabel}`,
                  pickerHeading: `The Journey · ${journeyProgress!.stops.length} Weeks`,
                  continueHref: journeyNav.continueHref,
                }
              : undefined
          }
          studyHref={studyHref}
          initialStatus={progressRow?.status ?? "not_started"}
          media={Object.fromEntries(
            [...weekMediaBySlot(studyContent).entries()].map(([slot, items]) => [
              slot,
              <WeekMediaList key={slot} lessonId={lesson.id} items={items} />,
            ])
          )}
        />
      ) : journeyNav?.stop.isThreshold ? (
        // A Part's introduction is a threshold: read it, look back at the
        // Part behind, and cross into the next.
        <>
          <div className="space-y-1">
            <Link href={journeyNav.homeHref} className="inline-block text-sm text-moss hover:text-ink underline underline-offset-2">
              ← The Journey
            </Link>
            <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 pt-4">
              The Journey · Threshold
            </p>
            <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink">{journeyNav.part.label}</h1>
          </div>
          {introTabs}
          {blocksBesideIntro.map((block) => (
            <LessonBlock key={block.id} block={block} initialAnswer={answerByBlockId.get(block.id)} />
          ))}
          {lookBack && <LookBackList lookBack={lookBack} heading={`Before you cross into ${journeyNav.part.shortLabel}`} />}
          <CompleteStopButton
            lessonId={lesson.id}
            initialStatus={progressRow?.status ?? "not_started"}
            label={journeyNav.part.index === 0 ? `Begin ${journeyNav.part.shortLabel}` : `Cross into ${journeyNav.part.shortLabel}`}
            doneLabel={journeyNav.part.index === 0 ? `${journeyNav.part.shortLabel} begun` : "Crossed"}
            continueHref={journeyNav.continueHref}
            continueLabel={journeyNav.continueHref === journeyNav.homeHref ? "Back to The Journey →" : "Go on →"}
          />
        </>
      ) : (
        <>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">{lesson.title}</h1>
          {introTabs}
          {blocksBesideIntro.map((block) => (
            <LessonBlock key={block.id} block={block} initialAnswer={answerByBlockId.get(block.id)} />
          ))}
        </>
      )}
      {journeyNav?.nextLockNote && (
        <JourneyNextStopNote note={journeyNav.nextLockNote} homeHref={journeyNav.homeHref} />
      )}
      {lockedNextLesson && (
        <LockedNextLesson
          label={shortLessonLabel(lockedNextLesson.title)}
          productHref={productHrefForLocked}
          kindLabel={studyKindLabel(study.kind).toLowerCase()}
          endOfSample={!laterOpenLesson}
        />
      )}
      {/* Only rendered by print CSS — invisible on screen (see globals.css). */}
      <p className="print-only-notice">
        Study content isn&apos;t available to print from the web app. If you&apos;d like a
        printed copy, the physical book is available at /store.
      </p>
      <LessonNavigation
        studyHref={studyHref}
        studyTitle={displayStudyTitle}
        lessonId={lesson.id}
        initialStatus={progressRow?.status ?? "not_started"}
        previousHref={previousHref}
        nextHref={nextHref}
        position="bottom"
        backLabel={journeyNav ? "The Journey" : undefined}
        continueHref={journeyNav?.continueHref}
        // Hidden for both custom-header cases, each for its own real
        // completion control that already covers this: a devotional's
        // WalkedToggle (see DevotionalAppView), and a Study week's own Lift
        // Up tab (see LiftUpTab and StudyLessonView's doc comment) -- both
        // make the same lesson_progress write this button would, so showing
        // this one too would be a second control for the same action,
        // disconnected from the per-tab progress ring sitting right above it.
        visible={!hasCustomHeader && !journeyNav?.stop.isThreshold}
      />
    </div>
  );
}
