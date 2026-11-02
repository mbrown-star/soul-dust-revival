import { NextRequest, NextResponse } from "next/server";
import { isValidCronRequest } from "@/lib/social/cronAuth";
import { db } from "@/lib/db/client";
import { socialPostTargets, socialPosts } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { publishTarget } from "@/lib/social/publish";
import { computeNextRun } from "@/lib/social/schedule";

export const runtime = "nodejs";

/**
 * Meant to be called every few minutes by an external scheduler (see
 * SOCIAL.md for the Cloudflare Worker Cron Trigger setup this needs —
 * Cloudflare Pages itself has no built-in cron, so this can't fire on its
 * own without something external hitting it on a schedule).
 */
export async function POST(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const due = await db
    .select()
    .from(socialPostTargets)
    .where(and(eq(socialPostTargets.status, "scheduled"), lte(socialPostTargets.nextRunAt, new Date())));

  const results: { targetId: string; ok: boolean; error?: string }[] = [];

  for (const target of due) {
    // Mark as sending immediately, so a slow publish call or an overlapping
    // cron invocation (if the previous run hasn't finished) can't double-send.
    await db.update(socialPostTargets).set({ status: "sending" }).where(eq(socialPostTargets.id, target.id));

    const post = await db.query.socialPosts.findFirst({ where: eq(socialPosts.id, target.postId) });
    if (!post) {
      await db
        .update(socialPostTargets)
        .set({ status: "failed", lastError: "Parent post no longer exists" })
        .where(eq(socialPostTargets.id, target.id));
      results.push({ targetId: target.id, ok: false, error: "missing_post" });
      continue;
    }

    try {
      const { externalPostId } = await publishTarget({
        platform: target.platform,
        body: post.body,
        imageUrl: post.imageUrl,
      });

      const nextRun = computeNextRun(target.nextRunAt, target.frequency, target.dayOfWeek);
      const pastEndDate = target.endDate && nextRun && nextRun > target.endDate;

      await db
        .update(socialPostTargets)
        .set({
          status: nextRun && !pastEndDate ? "scheduled" : "published",
          externalPostId,
          publishedAt: new Date(),
          nextRunAt: nextRun && !pastEndDate ? nextRun : target.nextRunAt,
          lastError: null,
        })
        .where(eq(socialPostTargets.id, target.id));

      results.push({ targetId: target.id, ok: true });
    } catch (err) {
      await db
        .update(socialPostTargets)
        .set({ status: "failed", lastError: err instanceof Error ? err.message : String(err) })
        .where(eq(socialPostTargets.id, target.id));
      results.push({ targetId: target.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
