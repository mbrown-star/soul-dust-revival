import { getDb } from "@/lib/db/client";
import { entitlements, studies, lessons, lessonProgress, journeys, bundleItems, products } from "@/lib/db/schema";
import { eq, and, inArray, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LibraryCard } from "@/components/study/LibraryCard";
import { isSneakPeek } from "@/lib/launchMode";
import { marketingUrl } from "@/lib/domains";
import { getDisplayStudyTitles } from "@/lib/study/displayTitle";
import { studyKindLabel, type StudyKind } from "@/lib/study/studyKindLabel";
import type { Metadata } from "next";
import { CatalogBrowser, type CatalogBrowserItem } from "@/components/catalog/CatalogBrowser";
import { JourneyCard } from "@/components/journey/JourneyCard";
import { completedCount, currentStopIndex, journeyHref, loadJourneyProgress } from "@/lib/journey/load";
import { formatOpensOn } from "@/lib/journey/schedule";
import { countedLessons, unitNoun } from "@/lib/study/lessonUnits";
import { journeyStopTitle } from "@/lib/journey/stopTitle";
import {
  normalizeSearchText,
  parseCatalogFilters,
  type CatalogSearchParams,
  type CatalogStatus,
} from "@/lib/catalog/filter";

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
    kind: StudyKind;
  };
  total: number;
  completed: number;
  /** "weeks", "days" or "chapters": what total counts. */
  unit: string;
  resumeHref: string;
  /** Read as a free sample -- the reader doesn't own this study. */
  sampleOnly: boolean;
  /** Lessons past the free sample (0 for a study the reader owns). */
  lockedCount: number;
  status: CatalogStatus;
};

// Section order on the page; also what the Status filter picks between.
const LIBRARY_GROUPS: { status: CatalogStatus; title: string }[] = [
  { status: "in_progress", title: "Continue" },
  { status: "not_started", title: "Not started" },
  { status: "completed", title: "Completed" },
];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<CatalogSearchParams> }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/library");
  const initialFilters = parseCatalogFilters(await searchParams);
  const db = await getDb();

  const entitledRows = await db
    .select({ productId: entitlements.productId })
    .from(entitlements)
    .where(eq(entitlements.userId, session.userId));
  const productIds = entitledRows.map((e) => e.productId);

  const ownedStudies =
    productIds.length === 0
      ? []
      : await db
          .select()
          .from(studies)
          .where(and(inArray(studies.productId, productIds), eq(studies.published, true)));

  // A published Journey the reader owns every Part of shows as one card,
  // in place of a card per Part (see JourneyCard).
  const journeyRows =
    ownedStudies.length === 0
      ? []
      : await db
          .select({ journey: journeys, componentProductId: bundleItems.componentProductId })
          .from(journeys)
          .innerJoin(bundleItems, eq(bundleItems.bundleProductId, journeys.bundleProductId))
          .where(eq(journeys.published, true));
  const ownedProductIds = new Set(productIds);
  const ownedJourneys = [...new Map(journeyRows.map((r) => [r.journey.id, r.journey])).values()].filter((j) =>
    journeyRows.filter((r) => r.journey.id === j.id).every((r) => ownedProductIds.has(r.componentProductId))
  );
  const journeyProductIds = new Set(
    journeyRows.filter((r) => ownedJourneys.some((j) => j.id === r.journey.id)).map((r) => r.componentProductId)
  );
  const journeyItems: CatalogBrowserItem[] = [];
  for (const journey of ownedJourneys) {
    const progress = await loadJourneyProgress(db, journey, session.userId);
    const bundle = await db.query.products.findFirst({
      where: eq(products.id, journey.bundleProductId),
      columns: { imageUrl: true, imageAlt: true },
    });
    const total = progress.stops.length;
    const done = completedCount(progress);
    const begun = !!progress.enrollment;
    const current = begun && total > 0 ? progress.stops[currentStopIndex(progress)] : undefined;
    const currentState = current ? progress.states[current.index] : undefined;
    const currentTitle = current ? journeyStopTitle(current) : "";
    const nextLine = !current
      ? null
      : currentState?.state === "waiting"
        ? `${currentTitle} opens ${formatOpensOn(currentState.opensOn)}.`
        : `This week: ${currentTitle}`;
    journeyItems.push({
      id: journey.id,
      kind: "study",
      status: !begun ? "not_started" : total > 0 && done === total ? "completed" : "in_progress",
      searchText: normalizeSearchText(
        `${journey.title} The Journey Study ${progress.parts.map((p) => p.label).join(" ")}`
      ),
      node: (
        <JourneyCard
          title={journey.title}
          href={journeyHref(journey)}
          coverImageUrl={bundle?.imageUrl ?? null}
          coverImageAlt={bundle?.imageAlt ?? null}
          partCount={progress.parts.length}
          done={done}
          total={total}
          begun={begun}
          nextLine={nextLine}
        />
      ),
    });
  }

  // Studies with a free sample the reader doesn't own show up too, as
  // "Sneak peek" cards counting only their sample lessons.
  const ownedIds = new Set(ownedStudies.map((s) => s.id));
  const sampleStudyIds = (
    await db
      .selectDistinct({ studyId: lessons.studyId })
      .from(lessons)
      .where(and(eq(lessons.isSample, true), eq(lessons.published, true)))
  )
    .map((r) => r.studyId)
    .filter((id) => !ownedIds.has(id));
  const sampleStudies =
    sampleStudyIds.length === 0
      ? []
      : await db
          .select()
          .from(studies)
          .where(and(inArray(studies.id, sampleStudyIds), eq(studies.published, true)));
  const sampleOnlyIds = new Set(sampleStudies.map((s) => s.id));
  const myStudies = [...ownedStudies.filter((s) => !journeyProductIds.has(s.productId)), ...sampleStudies];

  const studyIds = myStudies.map((s) => s.id);
  const allLessons =
    studyIds.length === 0
      ? []
      : await db
          .select({ id: lessons.id, studyId: lessons.studyId, title: lessons.title, orderIndex: lessons.orderIndex, isSample: lessons.isSample })
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

  const entries: LibraryEntry[] = [];

  for (const rawStudy of myStudies) {
    const study = { ...rawStudy, title: displayTitleByStudyId.get(rawStudy.id) ?? rawStudy.title };
    const allStudyLessons = allLessons.filter((l) => l.studyId === study.id);
    // For a sample, everything below counts only the lessons they can open.
    const sampleOnly = sampleOnlyIds.has(study.id);
    const studyLessons = sampleOnly ? allStudyLessons.filter((l) => l.isSample) : allStudyLessons;
    const lockedCount = allStudyLessons.length - studyLessons.length;
    // Counted in weeks, days or chapters, matching each reader's own ring.
    const units = countedLessons(study.kind, studyLessons);
    const total = units.length;
    const completed = units.filter((l) => statusByLessonId.get(l.id) === "completed").length;
    const anyStarted = studyLessons.some((l) => statusByLessonId.get(l.id) !== undefined);
    const unitsStarted = units.some((l) => statusByLessonId.get(l.id) !== undefined);

    // Resume at the first lesson that isn't already completed, so
    // "Continue"/"Start" always lands exactly where the reader left off,
    // never back at page one of a study they're partway through.
    // Once a reader has walked any week or day, Continue goes to the next one
    // not finished, past an Introduction left unmarked (the Psalms card
    // reopened the Introduction with four days walked).
    const nextLesson =
      (unitsStarted ? units : studyLessons).find((l) => statusByLessonId.get(l.id) !== "completed") ?? studyLessons[0];
    const resumeHref = nextLesson ? `/studies/${study.slug}/${nextLesson.id}` : `/studies/${study.slug}`;

    const status: CatalogStatus =
      total > 0 && completed === total ? "completed" : anyStarted ? "in_progress" : "not_started";
    entries.push({ study, total, completed, unit: unitNoun(study.kind, total), resumeHref, sampleOnly, lockedCount, status });
  }

  const isEmpty = myStudies.length === 0 && journeyItems.length === 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-2">My Library</h1>
      <p className="font-serif text-moss mb-10 max-w-xl">
        Pick up where you left off, start something new, or revisit a plan you&apos;ve finished.
      </p>

      {isEmpty ? (
        <div className="bg-dusk/5 border border-dusk/10 rounded-lg p-8 text-center">
          <p className="font-serif text-moss mb-4">You don&apos;t have any studies or devotionals yet.</p>
          {/* The store is closed on the sneak-peek site (lib/launchMode.ts). */}
          <Link
            href={marketingUrl(isSneakPeek() ? "/sneak-peek" : "/store")}
            className="inline-block bg-ink text-parchment rounded-lg px-5 py-3 font-sans text-sm font-medium min-h-[44px]"
          >
            {isSneakPeek() ? "Try a free sample" : "Browse studies & books"}
          </Link>
        </div>
      ) : (
        <CatalogBrowser
          initial={initialFilters}
          showStatus
          groups={LIBRARY_GROUPS}
          noun="titles"
          searchPlaceholder="Search your library"
          gridClassName="grid gap-4 sm:grid-cols-2"
          items={[
            ...journeyItems,
            ...entries.map((entry) => ({
            id: entry.study.id,
            kind: entry.study.kind,
            status: entry.status,
            searchText: normalizeSearchText(
              `${entry.study.title} ${entry.study.description ?? ""} ${studyKindLabel(entry.study.kind)}`,
            ),
            node: (
              <LibraryCard
                study={entry.study}
                completed={entry.completed}
                total={entry.total}
                unit={entry.unit}
                resumeHref={entry.resumeHref}
                showRestart={entry.status === "completed"}
                sampleOnly={entry.sampleOnly}
                lockedCount={entry.lockedCount}
              />
            ),
          })),
          ]}
        />
      )}
    </div>
  );
}
