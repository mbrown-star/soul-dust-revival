import { db } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EngagementReportPage() {
  const allLogins = await db
    .select({
      userId: loginEvents.userId,
      loginAt: loginEvents.loginAt,
      lastActiveAt: loginEvents.lastActiveAt,
      email: users.email,
    })
    .from(loginEvents)
    .leftJoin(users, eq(loginEvents.userId, users.id))
    .orderBy(desc(loginEvents.loginAt))
    .limit(2000); // bounded for a scaffold — move to a real SQL aggregate at scale

  // Group in JS: per user, login count, most recent login, average session
  // length. "Session length" here is lastActiveAt - loginAt for each login
  // event — an approximation driven by the heartbeat ping, not an exact
  // measurement, since there's no persistent connection telling us the
  // precise moment someone closes a tab. See PRIVACY.md.
  const byUser = new Map<
    string,
    { email: string | null; logins: number; lastLogin: Date | null; totalMinutes: number }
  >();

  for (const row of allLogins) {
    const existing = byUser.get(row.userId) ?? {
      email: row.email,
      logins: 0,
      lastLogin: null,
      totalMinutes: 0,
    };
    existing.logins += 1;
    if (row.loginAt && (!existing.lastLogin || row.loginAt > existing.lastLogin)) {
      existing.lastLogin = row.loginAt;
    }
    if (row.loginAt && row.lastActiveAt) {
      const minutes = (row.lastActiveAt.getTime() - row.loginAt.getTime()) / 60_000;
      existing.totalMinutes += Math.max(minutes, 0);
    }
    byUser.set(row.userId, existing);
  }

  const rows = [...byUser.entries()]
    .map(([userId, data]) => ({
      userId,
      ...data,
      avgMinutes: data.logins > 0 ? data.totalMinutes / data.logins : 0,
    }))
    .sort((a, b) => (b.lastLogin?.getTime() ?? 0) - (a.lastLogin?.getTime() ?? 0));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/reports" className="text-sm text-neutral-400">
          ← Reports
        </Link>
        <h1 className="text-xl font-semibold">Engagement</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Session length is approximate — based on periodic activity pings while a page
          is open, not an exact measurement of when someone closes a tab.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b text-neutral-500">
              <th scope="col" className="py-2 pr-4 font-medium">User</th>
              <th scope="col" className="py-2 pr-4 font-medium">Logins</th>
              <th scope="col" className="py-2 pr-4 font-medium">Last login</th>
              <th scope="col" className="py-2 font-medium">Avg. session</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-neutral-100">
                <td className="py-3 pr-4">{row.email ?? row.userId}</td>
                <td className="py-3 pr-4">{row.logins}</td>
                <td className="py-3 pr-4 text-neutral-500">
                  {row.lastLogin ? row.lastLogin.toLocaleString() : "—"}
                </td>
                <td className="py-3">{row.avgMinutes.toFixed(1)} min</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-neutral-400">
                  No logins recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
