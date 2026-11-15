import { NextRequest, NextResponse } from "next/server";
import { isValidCronRequest } from "@/lib/social/cronAuth";
import { getDb } from "@/lib/db/client";
import { socialPostTargets } from "@/lib/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { claimAndPublish } from "@/lib/social/publishClaimed";

export const runtime = "nodejs";

/**
 * Called every 10 minutes by the production Worker's Cron Trigger (see
 * SOCIAL.md and lib/cron/scheduledJobs.ts). Publishes every due target.
 */
export async function POST(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb();
  const due = await db
    .select()
    .from(socialPostTargets)
    .where(and(eq(socialPostTargets.status, "scheduled"), lte(socialPostTargets.nextRunAt, new Date())));

  const results = [];
  for (const target of due) {
    // claimAndPublish claims atomically (UPDATE ... WHERE status='scheduled'
    // RETURNING), so an overlapping run or an admin's "Publish now" can't
    // publish the same target twice; a lost claim returns null.
    const outcome = await claimAndPublish(target.id, "due");
    if (outcome) results.push(outcome);
  }

  return NextResponse.json({ processed: results.length, results });
}
