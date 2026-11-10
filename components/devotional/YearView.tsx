"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MONTH_NAMES } from "@/lib/devotional/parseDayLabel";
import { lockedLessonNote } from "@/lib/launchMode";

export type YearDay = {
  lessonId: string;
  href: string;
  day: number;
  date: string;
  month: string;
  dateNum: number;
  psalmRef: string;
  psalmNumber: number | null;
  title: string;
  walked: boolean;
  answered: boolean;
  isToday: boolean;
  /** Past the free sample for a reader who hasn't bought the devotional. */
  locked?: boolean;
};

/**
 * The 12-month grid of every day in the devotional, with walked/today/
 * answered markers, three running stats, and a search box -- matching
 * soul-dust-psalms-365's own devotional_template.html "The Year" view.
 * Unlike that reference (localStorage-only, its own documented biggest
 * functional gap), every stat and marker here comes from the real
 * lesson_progress / responses data this page already fetched server-side,
 * so it's correct across devices for the same account.
 */
export function YearView({ days }: { days: YearDay[] }) {
  const [query, setQuery] = useState("");

  const anyLocked = days.some((d) => d.locked);
  const daysWalked = days.filter((d) => d.walked).length;
  const answersWritten = days.filter((d) => d.answered).length;
  const psalmsCovered = new Set(
    days.filter((d) => d.walked && d.psalmNumber !== null).map((d) => d.psalmNumber)
  ).size;

  const months = useMemo(() => {
    const byMonth = new Map<string, YearDay[]>();
    for (const d of days) {
      const bucket = byMonth.get(d.month) ?? [];
      bucket.push(d);
      byMonth.set(d.month, bucket);
    }
    return MONTH_NAMES.map((m) => ({ month: m, days: byMonth.get(m) ?? [] })).filter((m) => m.days.length > 0);
  }, [days]);

  const normalizedQuery = query.trim().toLowerCase();
  const isNumericQuery = /^\d+$/.test(normalizedQuery);
  const results = normalizedQuery
    ? days
        .filter((d) =>
          isNumericQuery
            ? d.psalmNumber === Number(normalizedQuery)
            : `${d.title} ${d.psalmRef} ${d.date}`.toLowerCase().includes(normalizedQuery)
        )
        .slice(0, 30)
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-dusk/10 rounded-xl p-3">
          <p className="font-display text-2xl text-ink tabular-nums">{daysWalked}</p>
          <p className="font-sans text-xs text-moss">days walked</p>
        </div>
        <div className="bg-white border border-dusk/10 rounded-xl p-3">
          <p className="font-display text-2xl text-ink tabular-nums">{psalmsCovered}</p>
          <p className="font-sans text-xs text-moss">of 150 psalms</p>
        </div>
        <div className="bg-white border border-dusk/10 rounded-xl p-3">
          <p className="font-display text-2xl text-ink tabular-nums">{answersWritten}</p>
          <p className="font-sans text-xs text-moss">answers written</p>
        </div>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a day: a psalm number, a title, a word…"
        aria-label="Search days"
        className="w-full font-sans text-sm rounded-lg border border-dusk/20 px-4 py-3 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ink"
      />

      {normalizedQuery ? (
        <div className="flex flex-col divide-y divide-dusk/10">
          {results.length ? (
            results.map((d) => {
              const content = (
                <>
                  <span className={`font-sans text-xs font-bold shrink-0 w-16 ${d.locked ? "text-moss" : "text-ember-700"}`}>
                    DAY {d.day}
                  </span>
                  <span className="min-w-0">
                    <span className={`block font-sans font-semibold truncate ${d.locked ? "text-ink/60" : "text-ink"}`}>
                      {d.title}
                    </span>
                    <span className="block font-sans text-xs text-moss">
                      {d.locked ? lockedLessonNote() : `${d.date} · ${d.psalmRef}`}
                    </span>
                  </span>
                </>
              );
              return d.locked ? (
                <div key={d.lessonId} className="flex gap-3 py-3 min-h-[44px] items-center">
                  {content}
                </div>
              ) : (
                <Link
                  key={d.lessonId}
                  href={d.href}
                  className="flex gap-3 py-3 min-h-[44px] items-center hover:bg-white/60"
                >
                  {content}
                </Link>
              );
            })
          ) : (
            <p className="font-sans text-sm text-moss py-3">No days match &ldquo;{query}&rdquo;.</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 font-sans text-xs text-moss">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-moss" aria-hidden="true" /> Walked
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border-2 border-ember" aria-hidden="true" /> Today
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-block w-3 h-3 rounded-sm border border-dusk/20" aria-hidden="true">
                <span className="absolute top-0 right-0 w-1 h-1 rounded-full bg-ember-700 translate-x-1/4 -translate-y-1/4" />
              </span>
              Answer written
            </span>
            {anyLocked && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-dusk/10" aria-hidden="true" /> {lockedLessonNote()}
              </span>
            )}
          </div>

          <div className="space-y-6">
            {months.map(({ month, days: monthDays }) => {
              const firstPsalm = monthDays[0]?.psalmNumber;
              const lastPsalm = monthDays[monthDays.length - 1]?.psalmNumber;
              const walkedInMonth = monthDays.filter((d) => d.walked).length;
              return (
                <div key={month}>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <h3 className="font-display text-lg text-ink">{month}</h3>
                    <span className="font-sans text-xs text-moss">
                      {firstPsalm && lastPsalm ? `Psalms ${firstPsalm}–${lastPsalm} · ` : ""}
                      {walkedInMonth}/{monthDays.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {monthDays.map((d) =>
                      d.locked ? (
                        // Shown so the reader sees the whole year, but not a link.
                        <div
                          key={d.lessonId}
                          title={`${d.date} · ${lockedLessonNote()}`}
                          className="aspect-square flex items-center justify-center rounded-lg bg-dusk/10 font-sans text-xs tabular-nums text-moss/70 min-h-[32px]"
                        >
                          <span aria-hidden="true">{d.dateNum}</span>
                          <span className="sr-only">{`Day ${d.day}, ${d.date}: locked`}</span>
                        </div>
                      ) : (
                      <Link
                        key={d.lessonId}
                        href={d.href}
                        title={`${d.date} · ${d.psalmRef}`}
                        aria-label={`Day ${d.day}, ${d.date}: ${d.psalmRef}${d.walked ? ", walked" : ""}`}
                        className={`relative aspect-square flex items-center justify-center rounded-lg border font-sans font-semibold text-xs tabular-nums min-h-[32px] ${
                          d.walked
                            ? "bg-moss border-moss text-white"
                            : "bg-white border-dusk/20 text-moss hover:border-moss/50"
                        } ${d.isToday ? "outline outline-2 outline-ember outline-offset-1" : ""}`}
                      >
                        {d.dateNum}
                        {d.answered && (
                          <span
                            className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${
                              d.walked ? "bg-white" : "bg-ember-700"
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </Link>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
