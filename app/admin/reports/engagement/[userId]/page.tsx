import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { activityVisits, lessons, loginEvents, products, studies, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/admin/guard";
import { formatDateTime } from "@/lib/format/date";
import { formatDuration } from "@/lib/format/duration";
import { ACTIVITY_AREAS, AREA_LABELS, isUuid, sectionLabel, type ActivityArea } from "@/lib/activity/classifyPath";

export const metadata: Metadata = { title: "Engagement: history" };

export const dynamic = "force-dynamic";

const RECENT_VISITS = 200;
const RECENT_SIGN_INS = 50;

/**
 * One person's history: time on each part of the site, which sections and
 * studies it went to, their recent page visits with times, and their sign-ins.
 * From activity_visits (logged since 2026-11-16) and login_events.
 */
export default async function EngagementUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!(await requireAdmin())) redirect(`/login?next=/admin/reports/engagement/${userId}`);
  if (!isUuid(userId)) notFound();

  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) notFound();

  const [bySection, byStudy, visits, signIns] = await Promise.all([
    db
      .select({
        area: activityVisits.area,
        section: activityVisits.section,
        seconds: sql<number>`sum(${activityVisits.activeSeconds})::integer`,
        visits: sql<number>`count(*)::integer`,
        lastAt: sql<Date>`max(${activityVisits.lastSeenAt})`,
      })
      .from(activityVisits)
      .where(eq(activityVisits.userId, userId))
      .groupBy(activityVisits.area, activityVisits.section),
    db
      .select({
        studyId: activityVisits.studyId,
        title: studies.title,
        seconds: sql<number>`sum(${activityVisits.activeSeconds})::integer`,
        lessonsOpened: sql<number>`count(distinct ${activityVisits.lessonId})::integer`,
        lastAt: sql<Date>`max(${activityVisits.lastSeenAt})`,
      })
      .from(activityVisits)
      .innerJoin(studies, eq(studies.id, activityVisits.studyId))
      .where(and(eq(activityVisits.userId, userId), isNotNull(activityVisits.studyId)))
      .groupBy(activityVisits.studyId, studies.title)
      .orderBy(desc(sql`sum(${activityVisits.activeSeconds})`)),
    db
      .select({
        id: activityVisits.id,
        area: activityVisits.area,
        section: activityVisits.section,
        path: activityVisits.path,
        startedAt: activityVisits.startedAt,
        activeSeconds: activityVisits.activeSeconds,
        studyTitle: studies.title,
        lessonTitle: lessons.title,
        productTitle: products.title,
      })
      .from(activityVisits)
      .leftJoin(studies, eq(studies.id, activityVisits.studyId))
      .leftJoin(lessons, eq(lessons.id, activityVisits.lessonId))
      .leftJoin(products, eq(products.id, activityVisits.productId))
      .where(eq(activityVisits.userId, userId))
      .orderBy(desc(activityVisits.startedAt))
      .limit(RECENT_VISITS),
    db
      .select({
        loginAt: loginEvents.loginAt,
        lastActiveAt: loginEvents.lastActiveAt,
        activeSeconds: loginEvents.activeSeconds,
      })
      .from(loginEvents)
      .where(eq(loginEvents.userId, userId))
      .orderBy(desc(loginEvents.loginAt))
      .limit(RECENT_SIGN_INS),
  ]);

  const areaSeconds = new Map<ActivityArea, number>();
  for (const s of bySection) areaSeconds.set(s.area, (areaSeconds.get(s.area) ?? 0) + s.seconds);
  const sections = [...bySection].sort((a, b) => b.seconds - a.seconds);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/reports/engagement" className="text-sm text-moss">
          ← Engagement
        </Link>
        <h1 className="text-xl font-semibold break-words">{user.email}</h1>
        <p className="text-sm text-moss mt-1">
          Time is counted while a page is open and visible, from pings sent once a minute.
          Pages are logged from November 16, 2026, and kept for 13 months. Two tabs open at
          once each count their own time.
        </p>
      </div>

      <section aria-labelledby="areas-heading" className="space-y-3">
        <h2 id="areas-heading" className="font-semibold">Time on each part of the site</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ACTIVITY_AREAS.map((area) => (
            <div key={area} className="border border-moss/20 rounded-lg p-3">
              <dt className="text-sm text-moss">{AREA_LABELS[area]}</dt>
              <dd className="text-lg font-semibold text-ink">{formatDuration(areaSeconds.get(area) ?? 0)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="sections-heading" className="space-y-3">
        <h2 id="sections-heading" className="font-semibold">Where the time went</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b text-moss">
                <th scope="col" className="py-2 pr-4 font-medium">Area</th>
                <th scope="col" className="py-2 pr-4 font-medium">Section</th>
                <th scope="col" className="py-2 pr-4 font-medium">Time</th>
                <th scope="col" className="py-2 pr-4 font-medium">Visits</th>
                <th scope="col" className="py-2 font-medium">Last there</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={`${s.area}:${s.section}`} className="border-b border-moss/20">
                  <td className="py-3 pr-4">{AREA_LABELS[s.area]}</td>
                  <td className="py-3 pr-4">{sectionLabel(s.area, s.section)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatDuration(s.seconds)}</td>
                  <td className="py-3 pr-4">{s.visits}</td>
                  <td className="py-3 text-moss">{formatDateTime(s.lastAt)}</td>
                </tr>
              ))}
              {sections.length === 0 && <EmptyRow colSpan={5} />}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="studies-heading" className="space-y-3">
        <h2 id="studies-heading" className="font-semibold">Studies and devotionals</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b text-moss">
                <th scope="col" className="py-2 pr-4 font-medium">Title</th>
                <th scope="col" className="py-2 pr-4 font-medium">Time</th>
                <th scope="col" className="py-2 pr-4 font-medium">Lessons opened</th>
                <th scope="col" className="py-2 font-medium">Last read</th>
              </tr>
            </thead>
            <tbody>
              {byStudy.map((s) => (
                <tr key={s.studyId} className="border-b border-moss/20">
                  <td className="py-3 pr-4">{s.title}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">{formatDuration(s.seconds)}</td>
                  <td className="py-3 pr-4">{s.lessonsOpened}</td>
                  <td className="py-3 text-moss">{formatDateTime(s.lastAt)}</td>
                </tr>
              ))}
              {byStudy.length === 0 && <EmptyRow colSpan={4} />}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="visits-heading" className="space-y-3">
        <h2 id="visits-heading" className="font-semibold">Recent pages</h2>
        <p className="text-sm text-moss">The latest {RECENT_VISITS} pages, newest first.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b text-moss">
                <th scope="col" className="py-2 pr-4 font-medium">Started</th>
                <th scope="col" className="py-2 pr-4 font-medium">Area</th>
                <th scope="col" className="py-2 pr-4 font-medium">Page</th>
                <th scope="col" className="py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className="border-b border-moss/20 align-top">
                  <td className="py-3 pr-4 text-moss whitespace-nowrap">{formatDateTime(v.startedAt)}</td>
                  <td className="py-3 pr-4">{AREA_LABELS[v.area]}</td>
                  <td className="py-3 pr-4">
                    <span className="block">{sectionLabel(v.area, v.section)}</span>
                    <span className="block text-moss break-all">
                      {pageDetail(v)}
                    </span>
                  </td>
                  <td className="py-3 whitespace-nowrap">{formatDuration(v.activeSeconds)}</td>
                </tr>
              ))}
              {visits.length === 0 && <EmptyRow colSpan={4} />}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="signins-heading" className="space-y-3">
        <h2 id="signins-heading" className="font-semibold">Sign-ins</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b text-moss">
                <th scope="col" className="py-2 pr-4 font-medium">Signed in</th>
                <th scope="col" className="py-2 pr-4 font-medium">Last active</th>
                <th scope="col" className="py-2 font-medium">Time on the site</th>
              </tr>
            </thead>
            <tbody>
              {signIns.map((l, i) => (
                <tr key={i} className="border-b border-moss/20">
                  <td className="py-3 pr-4">{l.loginAt ? formatDateTime(l.loginAt) : "—"}</td>
                  <td className="py-3 pr-4 text-moss">{l.lastActiveAt ? formatDateTime(l.lastActiveAt) : "—"}</td>
                  <td className="py-3 whitespace-nowrap">{formatDuration(l.activeSeconds)}</td>
                </tr>
              ))}
              {signIns.length === 0 && <EmptyRow colSpan={3} />}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function pageDetail(v: {
  path: string;
  studyTitle: string | null;
  lessonTitle: string | null;
  productTitle: string | null;
}): string {
  if (v.lessonTitle && v.studyTitle) return `${v.studyTitle} · ${v.lessonTitle}`;
  if (v.studyTitle) return v.studyTitle;
  if (v.productTitle) return v.productTitle;
  return v.path;
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-moss">
        Nothing logged yet.
      </td>
    </tr>
  );
}
