import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { socialPostTargets, socialPosts } from "@/lib/db/schema";
import { publishTarget } from "@/lib/social/publish";
import { computeNextRun } from "@/lib/social/schedule";

type TargetStatus = (typeof socialPostTargets.$inferSelect)["status"];

/** Statuses an admin may publish from right away ("Publish now"). */
export const PUBLISH_NOW_FROM: readonly TargetStatus[] = ["scheduled", "failed", "paused", "draft"];

export type PublishOutcome =
  | { targetId: string; ok: true; externalPostId: string }
  | { targetId: string; ok: false; error: string };

/**
 * Claims one target and publishes it. The claim is an atomic
 * UPDATE ... WHERE status IN (...) RETURNING, so two callers (the cron, a
 * second click, a scheduler retry) can never publish the same target twice;
 * a caller that loses the claim gets `null`.
 *
 * `due` is the scheduler: it only takes `scheduled` targets and, for a
 * recurring one, moves `nextRunAt` to the next occurrence. `now` is an
 * admin's "Publish now": it takes any not-yet-sent status and leaves a
 * recurring schedule exactly where it was.
 */
export async function claimAndPublish(targetId: string, mode: "due" | "now"): Promise<PublishOutcome | null> {
  const db = await getDb();
  const fromStatuses = mode === "due" ? (["scheduled"] as TargetStatus[]) : [...PUBLISH_NOW_FROM];

  const [target] = await db
    .update(socialPostTargets)
    .set({ status: "sending" })
    .where(and(eq(socialPostTargets.id, targetId), inArray(socialPostTargets.status, fromStatuses)))
    .returning();
  if (!target) return null;

  const post = await db.query.socialPosts.findFirst({ where: eq(socialPosts.id, target.postId) });
  if (!post) {
    await db
      .update(socialPostTargets)
      .set({ status: "failed", lastError: "Parent post no longer exists" })
      .where(eq(socialPostTargets.id, target.id));
    return { targetId, ok: false, error: "missing_post" };
  }

  try {
    const { externalPostId } = await publishTarget({ platform: target.platform, body: post.body, imageUrl: post.imageUrl });

    let next: { status: "scheduled" | "published"; nextRunAt: Date };
    if (mode === "due") {
      const nextRun = computeNextRun(target.nextRunAt, target.frequency, target.dayOfWeek);
      const pastEndDate = target.endDate && nextRun && nextRun > target.endDate;
      next = nextRun && !pastEndDate ? { status: "scheduled", nextRunAt: nextRun } : { status: "published", nextRunAt: target.nextRunAt };
    } else {
      // A recurring post keeps its schedule; its next run is still ahead.
      const stillRecurring = target.frequency !== "once" && (!target.endDate || target.nextRunAt <= target.endDate);
      next = stillRecurring ? { status: "scheduled", nextRunAt: target.nextRunAt } : { status: "published", nextRunAt: target.nextRunAt };
    }

    await db
      .update(socialPostTargets)
      .set({ ...next, externalPostId, publishedAt: new Date(), lastError: null })
      .where(eq(socialPostTargets.id, target.id));
    return { targetId, ok: true, externalPostId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(socialPostTargets).set({ status: "failed", lastError: message }).where(eq(socialPostTargets.id, target.id));
    return { targetId, ok: false, error: message };
  }
}
