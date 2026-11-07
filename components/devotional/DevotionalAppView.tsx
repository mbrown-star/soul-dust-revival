"use client";

import { useState } from "react";
import Link from "next/link";
import { DevotionalDayView } from "./DevotionalDayView";
import { YearView, type YearDay } from "./YearView";
import { JournalView, type JournalEntry } from "./JournalView";
import { SixFacesOfTheDust } from "./SixFacesOfTheDust";

const TABS = [
  { key: "today", label: "Today" },
  { key: "year", label: "The Year" },
  { key: "journal", label: "Journal" },
  { key: "faces", label: "Six Faces of the Dust" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// "Soul Dust Revival: 365 Days of Psalms Devotional for Everyone" ->
// "365 Days of Psalms Devotional for Everyone" -- the header prefixes its
// own "Soul Dust Revival ·" eyebrow (matching soul-dust-psalms-365's own
// devotional_template.html), so the stored title needs that shared brand
// prefix stripped first or it shows up twice.
function deriveAppTitle(studyTitle: string): string {
  const stripped = studyTitle.replace(/^soul dust revival:?\s*/i, "").trim();
  return stripped || studyTitle;
}

/**
 * The devotional reader's own 4-view app shell (Today / The Year / Journal /
 * Six Faces of the Dust) -- matching soul-dust-psalms-365's own
 * devotional_template.html, which the previous single-scrolling-page build
 * (DevotionalDayView on its own) was missing entirely. Every progress/answer
 * figure here comes from this account's real lesson_progress/responses data
 * fetched server-side, not per-browser localStorage like that reference.
 */
export function DevotionalAppView({
  studyTitle,
  studyHref,
  totalDays,
  daysWalked,
  today,
  yearDays,
  journalEntries,
}: {
  studyTitle: string;
  studyHref: string;
  totalDays: number;
  daysWalked: number;
  today: {
    dayLabel: string;
    bodyHtml: string;
    previousHref: string | null;
    nextHref: string | null;
    lessonId: string;
    questionBlockId: string | null;
    initialAnswer?: string;
    initialWalked: boolean;
    pickUpWithToday?: { href: string } | null;
  };
  yearDays: YearDay[];
  journalEntries: JournalEntry[];
}) {
  const [tab, setTab] = useState<TabKey>("today");
  const appTitle = deriveAppTitle(studyTitle);
  const percent = totalDays > 0 ? Math.round((daysWalked / totalDays) * 100) : 0;

  return (
    <div className="space-y-6">
      <Link href={studyHref} className="inline-block text-sm text-moss hover:text-ink underline underline-offset-2">
        ← Back to table of contents
      </Link>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">
            Soul Dust Revival · Universal Edition
          </p>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-0.5">{appTitle}</h1>
        </div>
        <div className="relative w-14 h-14 shrink-0" aria-label="Days walked">
          <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
            <circle cx="20" cy="20" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-dusk/15" />
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-moss transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
            />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center font-sans font-bold text-ink tabular-nums leading-none">
            <span className="text-sm">{daysWalked}</span>
            <span className="text-[8px] tracking-wide text-moss font-semibold">OF {totalDays}</span>
          </span>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Devotional sections"
        className="no-scrollbar flex gap-1 overflow-x-auto border-b border-dusk/10 pb-px"
        style={{ scrollbarWidth: "none" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-3 text-sm font-sans font-semibold border-b-2 -mb-px whitespace-nowrap min-h-[44px] ${
              tab === t.key ? "border-ember text-ink" : "border-transparent text-moss hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panels stay mounted (hidden, not removed) across tab switches, same
          reasoning as StudyLessonView -- switching to Year and back
          shouldn't reset a half-typed search query. */}
      <div role="tabpanel" hidden={tab !== "today"}>
        <DevotionalDayView
          dayLabel={today.dayLabel}
          bodyHtml={today.bodyHtml}
          previousHref={today.previousHref}
          nextHref={today.nextHref}
          lessonId={today.lessonId}
          questionBlockId={today.questionBlockId}
          initialAnswer={today.initialAnswer}
          initialWalked={today.initialWalked}
          pickUpWithToday={today.pickUpWithToday}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "year"}>
        <YearView days={yearDays} />
      </div>
      <div role="tabpanel" hidden={tab !== "journal"}>
        <JournalView entries={journalEntries} />
      </div>
      <div role="tabpanel" hidden={tab !== "faces"}>
        <SixFacesOfTheDust />
      </div>
    </div>
  );
}
