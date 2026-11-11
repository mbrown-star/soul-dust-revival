import { getDb } from "@/lib/db/client";
import { bundleItems, entitlements, lessons } from "@/lib/db/schema";
import { and, eq, or, isNull, gt } from "drizzle-orm";
import { getRoleForSession } from "@/lib/admin/guard";
import type { Session } from "@/lib/auth/session";
import { getJourneyForStudy, loadJourneyProgress, journeyHref, type Journey, type JourneyProgress } from "@/lib/journey/load";
import { canReadStop } from "@/lib/journey/schedule";

/**
 * Single source of truth for "does this user have access to this product".
 * Every gated route, API handler, and signed-URL generator should call this
 * rather than checking orders directly.
 */
export async function hasEntitlement(userId: string, productId: string): Promise<boolean> {
  const now = new Date();
  const db = await getDb();

  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.productId, productId),
        or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, now))
      )
    )
    .limit(1);

  return rows.length > 0;
}

export type StudyAccess = {
  /** May open the study's reader at all. */
  allowed: boolean;
  /**
   * An admin previewing: may also open unpublished studies and lessons. Admins
   * already control all of this content in the admin console, so reading it
   * in the reader grants nothing new; anything they save while previewing
   * (answers, progress) is scoped to their own account like anyone else's.
   */
  isAdminPreview: boolean;
};

/**
 * Reader access to a study, gated by its linked product: an entitlement, or
 * the admin role (to preview their own work). Every reader page and reader
 * API route uses this rather than combining the two checks itself.
 */
export async function getStudyAccess(session: Session, studyProductId: string): Promise<StudyAccess> {
  const isAdminPreview = (await getRoleForSession(session)) === "admin";
  if (isAdminPreview) return { allowed: true, isAdminPreview };
  return { allowed: await hasEntitlement(session.userId, studyProductId), isAdminPreview };
}

/** A lesson any signed-in reader may open without owning the study. */
export function isOpenSampleLesson(
  study: { published: boolean },
  lesson: { isSample: boolean; published: boolean }
): boolean {
  return lesson.isSample && lesson.published && study.published;
}

/** Whether a study has any lesson open to every signed-in reader. */
export async function studyHasOpenSample(study: { id: string; published: boolean }): Promise<boolean> {
  if (!study.published) return false;
  const db = await getDb();
  const row = await db.query.lessons.findFirst({
    where: and(eq(lessons.studyId, study.id), eq(lessons.isSample, true), eq(lessons.published, true)),
    columns: { id: true },
  });
  return !!row;
}

/**
 * Why a Journey stop can't be read yet (see lib/journey/schedule.ts): the
 * reader hasn't begun the Journey, an earlier stop isn't finished, or this
 * stop's week hasn't come.
 */
export type JourneyLock = {
  journeyHref: string;
  reason: "not_started" | "earlier_stop" | "waiting";
  /** For "waiting": the calendar date the stop opens. */
  opensOn?: string;
};

export type LessonAccess = StudyAccess & {
  /**
   * Allowed only because this lesson is part of the free sample -- the
   * reader doesn't own the study, so its other lessons stay locked.
   */
  sampleOnly: boolean;
  /** Set when an owner is refused only by The Journey's pacing. */
  journeyLock?: JourneyLock;
  /**
   * The Journey this lesson is a stop of, with the reader's place in it --
   * set only for a reader who owns the whole Journey (the only readers it
   * paces), so the lesson page can lay out navigation without reloading it.
   */
  journey?: JourneyProgress;
};

/**
 * Reader access to one lesson: everything getStudyAccess allows, plus a
 * published sample lesson of a published study for any signed-in reader.
 * Lesson-scoped on purpose -- the reader pages and every reader API route
 * that acts on a lesson (progress, answers, signed video URLs) ask about the
 * specific lesson, so sample access never extends to the study's other
 * lessons.
 *
 * A lesson in a published Journey is also paced: an owner may read it only
 * once it's his current stop or already done (journeyLock says why not).
 * Admins previewing are never paced.
 */
export async function getLessonAccess(
  session: Session,
  study: { id: string; productId: string; published: boolean },
  lesson: { id: string; isSample: boolean; published: boolean }
): Promise<LessonAccess> {
  const access = await getStudyAccess(session, study.productId);
  if (access.allowed) {
    if (!access.isAdminPreview) {
      const paced = await getJourneyPacing(session, study.id, lesson.id);
      if (paced?.lock) return { allowed: false, isAdminPreview: false, sampleOnly: false, journeyLock: paced.lock, journey: paced.progress };
      if (paced) return { ...access, sampleOnly: false, journey: paced.progress };
    }
    return { ...access, sampleOnly: false };
  }
  const sample = isOpenSampleLesson(study, lesson);
  return { allowed: sample, isAdminPreview: false, sampleOnly: sample };
}

/**
 * The Journey's pacing for one lesson, for a reader who owns every Part of
 * the published Journey it belongs to. Null when the lesson isn't paced for
 * him: no published Journey, or he owns only some Parts (then he reads what
 * he owns as ordinary studies -- pacing a Journey he can't begin would lock
 * him out of what he paid for).
 */
async function getJourneyPacing(
  session: Session,
  studyId: string,
  lessonId: string
): Promise<{ progress: JourneyProgress; lock: JourneyLock | null } | null> {
  const db = await getDb();
  const journey = await getJourneyForStudy(db, studyId);
  if (!journey || !(await ownsEveryPart(session.userId, journey))) return null;
  const progress = await loadJourneyProgress(db, journey, session.userId);
  const index = progress.stops.findIndex((s) => s.lessonId === lessonId);
  // Not a stop (an unpublished lesson): not paced. The reader pages refuse
  // drafts to non-admins themselves.
  if (index === -1) return { progress, lock: null };
  const href = journeyHref(journey);
  if (!progress.enrollment) {
    // A stop finished before the Journey was switched on stays open to reread.
    return { progress, lock: progress.completedLessonIds.has(lessonId) ? null : { journeyHref: href, reason: "not_started" } };
  }
  const state = progress.states[index]!;
  if (canReadStop(state)) return { progress, lock: null };
  return {
    progress,
    lock:
      state.state === "waiting"
        ? { journeyHref: href, reason: "waiting", opensOn: state.opensOn }
        : { journeyHref: href, reason: "earlier_stop" },
  };
}

async function ownsEveryPart(userId: string, journey: Journey): Promise<boolean> {
  const db = await getDb();
  const components = await db
    .select({ productId: bundleItems.componentProductId })
    .from(bundleItems)
    .where(eq(bundleItems.bundleProductId, journey.bundleProductId));
  if (components.length === 0) return false;
  for (const { productId } of components) {
    if (!(await hasEntitlement(userId, productId))) return false;
  }
  return true;
}

/**
 * Whether a reader owns a Journey: an entitlement to every one of its
 * component products (what buying the bundle grants), or the admin role.
 */
export async function getJourneyAccess(session: Session, journey: Journey): Promise<StudyAccess> {
  const isAdminPreview = (await getRoleForSession(session)) === "admin";
  if (isAdminPreview) return { allowed: true, isAdminPreview };
  return { allowed: await ownsEveryPart(session.userId, journey), isAdminPreview };
}
