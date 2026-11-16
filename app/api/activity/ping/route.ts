import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { loginEvents } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { ACTIVE_PING_CAP_SECONDS } from "@/lib/activity/activeTime";
import { recordVisit } from "@/lib/activity/recordVisit";
import { activityPingSchema } from "@/lib/validation/schemas";

/**
 * Called by ActivityHeartbeat once a minute while a signed-in person has a
 * page open and visible, plus on page changes and when the tab is hidden.
 *
 * On the most recent login_events row it adds the time since the last ping
 * to activeSeconds, at most ACTIVE_PING_CAP_SECONDS (a longer gap means the
 * reader was away), and moves lastActiveAt to now. One UPDATE, so two tabs
 * pinging at once can't count the same gap twice.
 *
 * With a `path`, it also logs the time against that page (activity_visits,
 * lib/activity/recordVisit.ts). A `resume` ping starts counting again
 * without adding the gap before it.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown = {};
  const text = await req.text().catch(() => "");
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }
  const parsed = activityPingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { path, resume = false } = parsed.data;

  const db = await getDb();

  const mostRecent = await db.query.loginEvents.findFirst({
    where: eq(loginEvents.userId, session.userId),
    orderBy: desc(loginEvents.loginAt),
  });

  if (mostRecent) {
    await db
      .update(loginEvents)
      .set({
        activeSeconds: resume
          ? loginEvents.activeSeconds
          : sql`${loginEvents.activeSeconds} + least(greatest(coalesce(extract(epoch from now() - ${loginEvents.lastActiveAt}), 0), 0), ${ACTIVE_PING_CAP_SECONDS})::integer`,
        lastActiveAt: sql`now()`,
      })
      .where(eq(loginEvents.id, mostRecent.id));
  }

  if (path) await recordVisit(db, session.userId, path, resume);

  return NextResponse.json({ ok: true });
}
