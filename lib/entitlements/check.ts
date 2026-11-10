import { getDb } from "@/lib/db/client";
import { entitlements, lessons } from "@/lib/db/schema";
import { and, eq, or, isNull, gt } from "drizzle-orm";
import { getRoleForSession } from "@/lib/admin/guard";
import type { Session } from "@/lib/auth/session";

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

export type LessonAccess = StudyAccess & {
  /**
   * Allowed only because this lesson is part of the free sample -- the
   * reader doesn't own the study, so its other lessons stay locked.
   */
  sampleOnly: boolean;
};

/**
 * Reader access to one lesson: everything getStudyAccess allows, plus a
 * published sample lesson of a published study for any signed-in reader.
 * Lesson-scoped on purpose -- the reader pages and every reader API route
 * that acts on a lesson (progress, answers, signed video URLs) ask about the
 * specific lesson, so sample access never extends to the study's other
 * lessons.
 */
export async function getLessonAccess(
  session: Session,
  study: { productId: string; published: boolean },
  lesson: { isSample: boolean; published: boolean }
): Promise<LessonAccess> {
  const access = await getStudyAccess(session, study.productId);
  if (access.allowed) return { ...access, sampleOnly: false };
  const sample = isOpenSampleLesson(study, lesson);
  return { allowed: sample, isAdminPreview: false, sampleOnly: sample };
}
