import { getDb } from "@/lib/db/client";
import { entitlements, studies, lessons, lessonProgress } from "@/lib/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LibraryCard } from "@/components/study/LibraryCard";
import { getDisplayStudyTitles } from "@/lib/study/displayTitle";
import type { Metadata } from "next";

// Reads per-user entitlements/progress on every request -- never static.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Library",
};

type LibraryEntry = {
  study: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    coverImageUrl: string | null;
    coverImageAlt: string | null;
    kind: "devotional" | "study";
  };
  total: number;
  completed: number;
  resumeHref: string;
};

export default async function LibraryPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/library");
  const db = await getDb();

  const entitledRows = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(eq(entitlements.userId, session.userId));
  const productIds = entitledRows.map((e) => e.productId);

  const myStudies =
    productIds.length === 0
      ? []
      : await db
          .select()
          .from(studies)
          .where(and(inArray(studies.productId, productIds), eq(studies.published, true)));

  const studyIds = myStudies.map((s) => s.id);
  const allLessons =
    studyIds.length === 0
      ? []
      : await db
          .select({ id: lessons.id, studyId: lessons.studyId, orderIndex: lessons.orderIndex })
          .from(lessons)
          .where(and(inArray(lessons.studyId, studyIds), eq(lessons.published, true)))
          .orderBy(asc(lessons.orderIndex));

  const lessonIds = allLessons.map((l) => l.id);
  const myProgress =
    lessonIds.length === 0
      ? []
      : await db
          .select({ lessonId: lessonProgress.lessonId, status: lessonProgress.status })
          .from(lessonProgress)
          .where(and(eq(lessonProgress.userId, session.userId), inArray(lessonProgress.lessonId, lessonIds)));
  const statusByLessonId = new Map(myProgress.map((p) => [p.lessonId, p.status]));

  // REAL FIX (qa/findings/FINDINGS_2026-11-07.md #2): this card previously
  // showed `study.title` (the study's own, not always customer-facing,
  // internal title -- e.g. a raw import filename) instead of the title
  // shown on the storefront and at checkout for the product the customer
  // actually bought. Batched to one extra query, not one per study.
  const displayTitleByStudyId = await getDisplayStudyTitles(db, myStudies);

  const continuing: LibraryEntry[] = [];
  const notStarted: LibraryEntry[] = [];
  const completedList: LibraryEntry[] = [];

  for (const rawStudy of myStudies) {
    const study = { ...rawStudy, title: displayTitleByStudyId.get(rawStudy.id) ?? rawStudy.title };
    const studyLessons = allLessons.filter((l) => l.studyId === study.id);
    const total = studyLessons.length;
    const completed = studyLessons.filter((l) => statusByLessonId.get(l.id) === "completed").length;
    const anyStarted = studyLessons.some((l) => statusByLessonId.get(l.id) !== undefined);

    // Resume at the first lesson that isn't already completed, so
    // "Continue"/"Start" always lands exactly where the reader left off,
    // never back at page one of a study they're partway through.
    const nextLesson = studyLessons.find((l) => statusByLessonId.get(l.id) !== "completed") ?? studyLessons[0];
    const resumeHref = nextLesson ? `/studies/${study.slug}/${nextLesson.id}` : `/studies/${study.slug}`;

    const entry: LibraryEntry = { study, total, completed, resumeHref };

    if (total > 0 && completed === total) {
      completedList.push(entry);
    } else if (anyStarted) {
      continuing.push(entry);
    } else {
      notStarted.push(entry);
    }
  }

  const isEmpty = myStudies.length === 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-2">My Library</h1>
      <p className="font-serif text-moss mb-10 max-w-xl">
        Pick up where you left off, start something new, or revisit a plan you&apos;ve finished.
      </p>

      {isEmpty ? (
        <div className="bg-dusk/5 border border-dusk/10 rounded-lg p-8 text-center">
          <p className="font-serif text-moss mb-4">You don&apos;t have any studies or devotionals yet.</p>
          <Link
            href="/books"
            className="inline-block bg-ink text-parchment rounded-lg px-5 py-3 font-sans text-sm font-medium min-h-[44px]"
          >
            Browse studies &amp; books
          </Link>
        </div>
      ) : (
        <div className="space-y-12">
          <LibrarySection title="Continue" entries={continuing} showRestart={false} />
          <LibrarySection title="Not started" entries={notStarted} showRestart={false} />
          <LibrarySection title="Completed" entries={completedList} showRestart={true} />
        </div>
      )}
    </div>
  );
}

function LibrarySection({
  title,
  entries,
  showRestart,
}: {
  title: string;
  entries: LibraryEntry[];
  showRestart: boolean;
}) {
  if (entries.length === 0) return null;

  return (
    <section>
      <h2 className="font-display font-semibold text-xl text-ink mb-4">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <LibraryCard
            key={entry.study.id}
            study={entry.study}
            completed={entry.completed}
            total={entry.total}
            resumeHref={entry.resumeHref}
            showRestart={showRestart}
          />
        ))}
      </div>
    </section>
  );
}
