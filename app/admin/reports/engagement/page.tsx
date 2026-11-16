import { getDb } from "@/lib/db/client";
import { activityVisits, loginEvents, users } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { formatDateTime } from "@/lib/format/date";
import { formatDuration } from "@/lib/format/duration";
import { ACTIVITY_AREAS, AREA_LABELS } from "@/lib/activity/classifyPath";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Engagement" };

export const dynamic = "force-dynamic";


export default async function EngagementReportPage() {
  if (!(await requireAdmin())) redirect("/login?next=/admin/reports/engagement");
  const db = await getDb();
  const allLogins = await db
    .select({
      userId: loginEvents.userId,
      loginAt: loginEvents.loginAt,
      activeSeconds: loginEvents.activeSeconds,
      email: users.email,
    })
    .from(loginEvents)
    .leftJoin(users, eq(loginEvents.userId, users.id))
    .orderBy(desc(loginEvents.loginAt))
    .limit(2000); // bounded for a scaffold — move to a real SQL aggregate at scale

  // Group in JS: per user, sign-in count, most recent sign-in, and average
  // time on the site per sign-in, from activeSeconds (each once-a-minute
  // ping adds the gap since the last, at most two minutes; see
  // app/api/activity/ping). Sign-ins with none recorded (before
  // active time was counted, or closed before the first ping) are left out
  // of the average. It used to be lastActiveAt - loginAt, which counted the
  // days between visits under one sign-in (945 minutes in the 2026-11-13 audit).
  const byUser = new Map<
    string,
    { email: string | null; logins: number; lastLogin: Date | null; activeSeconds: number; timedLogins: number }
  >();

  for (const row of allLogins) {
    const existing = byUser.get(row.userId) ?? {
      email: row.email,
      logins: 0,
      lastLogin: null,
      activeSeconds: 0,
      timedLogins: 0,
    };
    existing.logins += 1;
    if (row.loginAt && (!existing.lastLogin || row.loginAt > existing.lastLogin)) {
      existing.lastLogin = row.loginAt;
    }
    if (row.activeSeconds > 0) {
      existing.activeSeconds += row.activeSeconds;
      existing.timedLogins += 1;
    }
    byUser.set(row.userId, existing);
  }

  // Time per area (website, app, Leader Resources, admin) from the page
  // visit log, one aggregate row per user and area.
  const areaTotals = await db
    .select({
      userId: activityVisits.userId,
      email: users.email,
      area: activityVisits.area,
      seconds: sql<number>`sum(${activityVisits.activeSeconds})::integer`,
    })
    .from(activityVisits)
    .leftJoin(users, eq(activityVisits.userId, users.id))
    .groupBy(activityVisits.userId, users.email, activityVisits.area);
  const secondsByUserArea = new Map<string, number>();
  for (const t of areaTotals) {
    secondsByUserArea.set(`${t.userId}:${t.area}`, t.seconds);
    // Someone with page visits but no recorded sign-in (the sign-in record
    // can fail on its own; see 2026-11-12 in CLAUDE.md) is still listed.
    if (!byUser.has(t.userId)) {
      byUser.set(t.userId, { email: t.email, logins: 0, lastLogin: null, activeSeconds: 0, timedLogins: 0 });
    }
  }

  const rows = [...byUser.entries()]
    .map(([userId, data]) => ({
      userId,
      ...data,
      avgMinutes: data.timedLogins > 0 ? data.activeSeconds / 60 / data.timedLogins : null,
    }))
    .sort((a, b) => (b.lastLogin?.getTime() ?? 0) - (a.lastLogin?.getTime() ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reports" className="text-sm text-moss">
          ← Reports
        </Link>
        <h1 className="text-xl font-semibold">Engagement</h1>
        <p className="text-sm text-moss mt-1">
          Average session is time spent on the site per sign-in, counted from activity pings
          sent once a minute while a page is open. Time away doesn&apos;t count, even when a
          sign-in stays open for days. Sign-ins from before November 13, 2026 aren&apos;t counted.
        </p>
        <p className="text-sm text-moss mt-1">
          Website, App, Leader and Admin are total time on each part of the site, logged page
          by page from November 16, 2026. Before that, only App and Leader pages were timed.
          Select a person to see their history.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b text-moss">
              <th scope="col" className="py-2 pr-4 font-medium">User</th>
              <th scope="col" className="py-2 pr-4 font-medium whitespace-nowrap">Sign-ins</th>
              <th scope="col" className="py-2 pr-4 font-medium">Last sign-in</th>
              <th scope="col" className="py-2 pr-4 font-medium whitespace-nowrap">Avg. session</th>
              {ACTIVITY_AREAS.map((area) => (
                <th key={area} scope="col" className="py-2 pr-4 font-medium whitespace-nowrap">
                  {area === "leader" ? "Leader" : AREA_LABELS[area]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-moss/20">
                <td className="py-3 pr-4">
                  <Link href={`/admin/reports/engagement/${row.userId}`} className="text-ink underline underline-offset-2 hover:text-moss">
                    {row.email ?? row.userId}
                  </Link>
                </td>
                <td className="py-3 pr-4">{row.logins}</td>
                <td className="py-3 pr-4 text-moss">
                  {row.lastLogin ? formatDateTime(row.lastLogin) : "—"}
                </td>
                <td className="py-3 pr-4">{row.avgMinutes === null ? "—" : `${row.avgMinutes.toFixed(1)} min`}</td>
                {ACTIVITY_AREAS.map((area) => (
                  <td key={area} className="py-3 pr-4 whitespace-nowrap">
                    {formatDuration(secondsByUserArea.get(`${row.userId}:${area}`) ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4 + ACTIVITY_AREAS.length} className="py-6 text-center text-moss">
                  No sign-ins recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
