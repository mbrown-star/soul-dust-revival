import { and, asc, eq, inArray } from "drizzle-orm";
import { bundleItems, journeyEnrollments, journeys, lessonProgress, lessons, studies } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { shortLessonLabel } from "@/lib/study/shortLessonLabel";
import { stopStates, todayIn, type JourneyRhythm, type StopState } from "./schedule";

type Db = Awaited<ReturnType<typeof getDb>>;

export type Journey = typeof journeys.$inferSelect;

export type JourneyPart = {
  index: number;
  studyId: string;
  studySlug: string;
  productId: string;
  /** "Part Two — Formed and Sent" */
  label: string;
  /** "Part Two" */
  shortLabel: string;
};

export type JourneyStop = {
  /** 0-based position in the whole Journey. */
  index: number;
  lessonId: string;
  partIndex: number;
  title: string;
  /** "Week 17", or "Part Two" for a Part's threshold. */
  label: string;
  /** The first stop of a Part: its introduction. */
  isThreshold: boolean;
  href: string;
};

export type JourneyMap = { journey: Journey; parts: JourneyPart[]; stops: JourneyStop[] };

export type JourneyProgress = JourneyMap & {
  enrollment: (typeof journeyEnrollments.$inferSelect) | null;
  today: string | null;
  /** Per stop, in order. Empty until the reader begins. */
  states: StopState[];
};

// "Soul Dust Revival: Part Two — Formed and Sent" -> "Part Two — Formed and Sent"
export function partLabel(studyTitle: string): string {
  return studyTitle.replace(/^soul dust revival:?\s*/i, "").trim() || studyTitle;
}

function partShortLabel(label: string, index: number): string {
  const match = /^(Part [A-Za-z0-9]+)/.exec(label);
  return match ? match[1]! : `Part ${index + 1}`;
}

export function journeyHref(journey: { slug: string }): string {
  return `/journey/${journey.slug}`;
}

/** The published Journey a study is a Part of, if any. */
export async function getJourneyForStudy(db: Db, studyId: string): Promise<Journey | null> {
  const [row] = await db
    .select({ journey: journeys })
    .from(studies)
    .innerJoin(bundleItems, eq(bundleItems.componentProductId, studies.productId))
    .innerJoin(journeys, eq(journeys.bundleProductId, bundleItems.bundleProductId))
    .where(and(eq(studies.id, studyId), eq(journeys.published, true)))
    .limit(1);
  return row?.journey ?? null;
}

/**
 * A Journey's Parts and stops, in order: the bundle's components in its own
 * order, each read through its published study, and each study's published
 * lessons. Bounded by the Journey's size (about 52 lessons).
 */
export async function loadJourneyMap(db: Db, journey: Journey): Promise<JourneyMap> {
  const partRows = await db
    .select({ studyId: studies.id, slug: studies.slug, title: studies.title, productId: studies.productId })
    .from(bundleItems)
    .innerJoin(studies, eq(studies.productId, bundleItems.componentProductId))
    .where(and(eq(bundleItems.bundleProductId, journey.bundleProductId), eq(studies.published, true)))
    .orderBy(asc(bundleItems.orderIndex));

  const parts: JourneyPart[] = partRows.map((row, index) => {
    const label = partLabel(row.title);
    return { index, studyId: row.studyId, studySlug: row.slug, productId: row.productId, label, shortLabel: partShortLabel(label, index) };
  });

  const lessonRows =
    parts.length === 0
      ? []
      : await db
          .select({ id: lessons.id, studyId: lessons.studyId, title: lessons.title, orderIndex: lessons.orderIndex })
          .from(lessons)
          .where(and(inArray(lessons.studyId, parts.map((p) => p.studyId)), eq(lessons.published, true)))
          .orderBy(asc(lessons.orderIndex));

  const stops: JourneyStop[] = [];
  for (const part of parts) {
    lessonRows
      .filter((l) => l.studyId === part.studyId)
      .forEach((l, i) => {
        stops.push({
          index: stops.length,
          lessonId: l.id,
          partIndex: part.index,
          title: l.title,
          label: i === 0 ? part.shortLabel : shortLessonLabel(l.title),
          isThreshold: i === 0,
          href: `/studies/${part.studySlug}/${l.id}`,
        });
      });
  }
  return { journey, parts, stops };
}

export function rhythmOf(enrollment: typeof journeyEnrollments.$inferSelect): JourneyRhythm {
  return { weekday: enrollment.weekday, openedThrough: enrollment.openedThrough, nextOpensOn: enrollment.nextOpensOn };
}

/** A Journey's map plus one reader's place in it. */
export async function loadJourneyProgress(
  db: Db,
  journey: Journey,
  userId: string,
  now: Date = new Date()
): Promise<JourneyProgress> {
  const map = await loadJourneyMap(db, journey);
  const enrollment =
    (await db.query.journeyEnrollments.findFirst({
      where: and(eq(journeyEnrollments.userId, userId), eq(journeyEnrollments.journeyId, journey.id)),
    })) ?? null;

  const lessonIds = map.stops.map((s) => s.lessonId);
  const completedRows =
    lessonIds.length === 0
      ? []
      : await db
          .select({ lessonId: lessonProgress.lessonId })
          .from(lessonProgress)
          .where(
            and(
              eq(lessonProgress.userId, userId),
              inArray(lessonProgress.lessonId, lessonIds),
              eq(lessonProgress.status, "completed")
            )
          );
  const completedIds = new Set(completedRows.map((r) => r.lessonId));

  if (!enrollment) return { ...map, enrollment: null, today: null, states: [] };
  const today = todayIn(enrollment.timeZone, now);
  const states = stopStates(
    map.stops.map((s) => completedIds.has(s.lessonId)),
    rhythmOf(enrollment),
    today
  );
  return { ...map, enrollment, today, states };
}

/** Index of the stop to continue with: the open one, else the first unfinished. */
export function currentStopIndex(progress: JourneyProgress): number {
  const open = progress.states.findIndex((s) => s.state === "open");
  if (open !== -1) return open;
  const unfinished = progress.states.findIndex((s) => s.state !== "completed");
  return unfinished === -1 ? progress.stops.length - 1 : unfinished;
}

export function completedCount(progress: JourneyProgress): number {
  return progress.states.filter((s) => s.state === "completed").length;
}
