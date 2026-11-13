import { getDb } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { formatDateTime } from "@/lib/format/date";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Engagement" };

export const dynamic = "force-dynamic";

export default async function EngagementReportPage() {
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b text-moss">
              <th scope="col" className="py-2 pr-4 font-medium">User</th>
              <th scope="col" className="py-2 pr-4 font-medium">Sign-ins</th>
              <th scope="col" className="py-2 pr-4 font-medium">Last sign-in</th>
              <th scope="col" className="py-2 font-medium">Avg. session</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-moss/20">
                <td className="py-3 pr-4">{row.email ?? row.userId}</td>
                <td className="py-3 pr-4">{row.logins}</td>
                <td className="py-3 pr-4 text-moss">
                  {row.lastLogin ? formatDateTime(row.lastLogin) : "—"}
                </td>
                <td className="py-3">{row.avgMinutes === null ? "—" : `${row.avgMinutes.toFixed(1)} min`}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-moss">
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
