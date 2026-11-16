import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { activityVisits, lessons, products, studies } from "@/lib/db/schema";
import { ACTIVE_PING_CAP_SECONDS } from "@/lib/activity/activeTime";
import { classifyPath, isUuid } from "@/lib/activity/classifyPath";

/**
 * Logs one heartbeat ping against the page it came from (activity_visits).
 *
 * The visit continues while pings for the same path keep arriving less than
 * ACTIVE_PING_CAP_SECONDS apart: each adds the gap since the visit's last
 * ping (capped). A longer gap, or another path, starts a new visit. A
 * `resume` ping (page load, tab visible again) moves lastSeenAt without adding
 * the gap, since that time was spent away.
 *
 * Returns what was done, for tests.
 */
export async function recordVisit(
  db: Db,
  userId: string,
  path: string,
  resume: boolean,
): Promise<"skipped" | "continued" | "started"> {
  const where = classifyPath(path);
  if (!where) return "skipped";
  const cleanPath = path.split(/[?#]/)[0]!;

  const recent = await db
    .select({ id: activityVisits.id })
    .from(activityVisits)
    .where(
      and(
        eq(activityVisits.userId, userId),
        eq(activityVisits.path, cleanPath),
        gt(activityVisits.lastSeenAt, sql`now() - make_interval(secs => ${ACTIVE_PING_CAP_SECONDS})`),
      ),
    )
    .orderBy(desc(activityVisits.lastSeenAt))
    .limit(1);

  const visit = recent[0];
  if (visit) {
    await db
      .update(activityVisits)
      .set({
        activeSeconds: resume
          ? activityVisits.activeSeconds
          : sql`${activityVisits.activeSeconds} + least(greatest(extract(epoch from now() - ${activityVisits.lastSeenAt}), 0), ${ACTIVE_PING_CAP_SECONDS})::integer`,
        lastSeenAt: sql`now()`,
      })
      .where(eq(activityVisits.id, visit.id));
    return "continued";
  }

  const { studyId, lessonId, productId } = await resolveSubjects(db, where);
  await db.insert(activityVisits).values({
    userId,
    area: where.area,
    section: where.section,
    path: cleanPath,
    studyId,
    lessonId,
    productId,
  });
  return "started";
}

/** The ids of the study, lesson or product a page is about, when they exist. */
async function resolveSubjects(
  db: Db,
  where: NonNullable<ReturnType<typeof classifyPath>>,
): Promise<{ studyId: string | null; lessonId: string | null; productId: string | null }> {
  let studyId: string | null = null;
  let lessonId: string | null = null;
  let productId: string | null = null;

  if (where.lessonId && isUuid(where.lessonId)) {
    const [lesson] = await db
      .select({ id: lessons.id, studyId: lessons.studyId })
      .from(lessons)
      .where(eq(lessons.id, where.lessonId))
      .limit(1);
    if (lesson) {
      lessonId = lesson.id;
      studyId = lesson.studyId;
    }
  }
  if (!studyId && where.studySlug) {
    const [study] = await db.select({ id: studies.id }).from(studies).where(eq(studies.slug, where.studySlug)).limit(1);
    studyId = study?.id ?? null;
  }
  if (where.productSlug) {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, where.productSlug))
      .limit(1);
    productId = product?.id ?? null;
  }
  return { studyId, lessonId, productId };
}
