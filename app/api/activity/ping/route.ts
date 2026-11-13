import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { loginEvents } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { ACTIVE_PING_CAP_SECONDS } from "@/lib/activity/activeTime";

/**
 * Called once a minute by ActivityHeartbeat while an authenticated user has
 * a page open. On the most recent login_events row it adds the time since
 * the last ping to activeSeconds, at most ACTIVE_PING_CAP_SECONDS (a longer
 * gap means the reader was away), and moves lastActiveAt to now. The admin
 * engagement report's average session comes from activeSeconds. One UPDATE,
 * so two tabs pinging at once can't count the same gap twice.
 */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();

  const mostRecent = await db.query.loginEvents.findFirst({
    where: eq(loginEvents.userId, session.userId),
    orderBy: desc(loginEvents.loginAt),
  });

  if (mostRecent) {
    await db
      .update(loginEvents)
      .set({
        activeSeconds: sql`${loginEvents.activeSeconds} + least(greatest(coalesce(extract(epoch from now() - ${loginEvents.lastActiveAt}), 0), 0), ${ACTIVE_PING_CAP_SECONDS})::integer`,
        lastActiveAt: sql`now()`,
      })
      .where(eq(loginEvents.id, mostRecent.id));
  }

  return NextResponse.json({ ok: true });
}
