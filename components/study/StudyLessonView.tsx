"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { hasPassage, type StudyWeekContent } from "@/lib/study/studyContent";
import { StudyTab } from "./study-tabs/StudyTab";
import { PassageTab } from "./study-tabs/PassageTab";
import { WorkTheWordTab } from "./study-tabs/WorkTheWordTab";
import { LiveItTab } from "./study-tabs/LiveItTab";
import { LiftUpTab } from "./study-tabs/LiftUpTab";
import { GreekSheet } from "./GreekSheet";
import { WeekPickerSheet, type WeekPickerItem } from "./WeekPickerSheet";
import { useTabProgress } from "./useStudyProgress";
import type { LessonStatus } from "@/lib/study/lessonProgress";
import { ScrollFadeTabs } from "@/components/ui/ScrollFadeTabs";
import { WeekMediaContext } from "./WeekMediaSlot";
import type { WeekMediaSlot as WeekMediaSlotKey } from "@/lib/study/weekMedia";

const TABS = [
  { key: "study", label: "Study" },
  { key: "passage", label: "Passage" },
  { key: "work", label: "Work the Word" },
  { key: "live", label: "Live It" },
  { key: "lift", label: "Lift Up" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const RING_RADIUS = 16;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// "Week 7: Alive Together with Him" -> { weekLabel: "Week 7", weekTitle: "Alive Together with Him" }
function splitLessonTitle(lessonTitle: string): { weekLabel: string; weekTitle: string } {
  const match = /^(Week \d+):\s*(.*)$/.exec(lessonTitle);
  return match ? { weekLabel: match[1]!, weekTitle: match[2]! } : { weekLabel: lessonTitle, weekTitle: lessonTitle };
}

// "Soul Dust Revival Colossians" -> "Colossians" -- the breadcrumb prefixes its
// own "Soul Dust Revival ·" (matching soul-dust-interactive's own
// study_template.html: `"Soul Dust Revival · "+META.book+" · Week "+W.week`),
// so the study's own title needs that shared brand prefix stripped first or
// it shows up twice.
function deriveBookLabel(studyTitle: string): string {
  const stripped = studyTitle.replace(/^soul dust revival:?\s*/i, "").trim();
  return stripped || studyTitle;
}

/**
 * The 5-tab interactive Study reader (Study / Passage / Work the Word /
 * Live It / Lift Up), following the printed order of each week -- see
 * soul-dust-interactive/HANDOFF.md and its own study_template.html for the
 * full design this is built from (sticky header with a week-progress ring
 * and a week picker, a dotted tab bar, a per-tab "done" flag). Renders only
 * when the lesson has studyContent (see lib/study/studyContent.ts); a
 * Study-kind lesson without it (the "Introduction" lesson, or any lesson
 * imported before this existed) falls back to the plain content-block
 * reading view in the lesson page.
 *
 * The lesson page no longer renders LessonNavigation here at all (see its own
 * comment on why -- its "Mark complete & continue" button duplicated the Lift
 * Up tab's own completion action below), so this renders its own "back to
 * table of contents" link, matching DevotionalAppView's existing pattern.
 */
export function StudyLessonView({
  lessonId,
  lessonTitle,
  content,
  initialAnswers,
  previousHref,
  nextHref,
  bookLabel,
  weeks,
  studyHref,
  initialStatus,
  media = {},
  journey,
}: {
  lessonId: string;
  lessonTitle: string;
  content: StudyWeekContent;
  initialAnswers: Record<string, string>;
  previousHref: string | null;
  nextHref: string | null;
  bookLabel: string;
  weeks: WeekPickerItem[];
  studyHref: string;
  initialStatus: LessonStatus;
  /** Server-rendered media placed inside the week, keyed by where it goes. */
  media?: Partial<Record<WeekMediaSlotKey, ReactNode>>;
  /** Set when this week is a stop in The Journey (see lib/journey/nav.ts). */
  journey?: {
    homeHref: string;
    /** "The Journey · Part Two" */
    breadcrumb: string;
    pickerHeading: string;
    /** Where finishing the week leads. */
    continueHref: string;
  };
}) {
  const [tab, setTab] = useState<TabKey>("study");
  const [greekStationRef, setGreekStationRef] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [workStationIndex, setWorkStationIndex] = useState(0);
  const { done, setDone, percent } = useTabProgress(lessonId);

  const { weekLabel, weekTitle } = splitLessonTitle(lessonTitle);
  const shortBookLabel = deriveBookLabel(bookLabel);
  const greekStation = content.stations.find((s) => s.ref === greekStationRef) ?? null;
  const showPassage = hasPassage(content);
  const tabs = TABS.filter((t) => showPassage || t.key !== "passage");
  // A week with no passage has nothing to finish there: count that tab done,
  // so the week's ring (and the week picker's) can still reach 100%.
  useEffect(() => {
    if (!showPassage && !done.has("passage")) setDone("passage", true);
  }, [showPassage, done, setDone]);

  function goToStation(stationRef: string) {
    setGreekStationRef(null);
    const index = content.stations.findIndex((s) => s.ref === stationRef);
    if (index !== -1) setWorkStationIndex(index);
    setTab("work");
    requestAnimationFrame(() => {
      document.getElementById(`station-${stationRef}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <WeekMediaContext.Provider value={media}>
    <div className="space-y-6">
      <Link
        href={journey?.homeHref ?? studyHref}
        className="inline-block text-sm text-moss hover:text-ink underline underline-offset-2"
      >
        {journey ? "← The Journey" : "← Back to table of contents"}
      </Link>

      <div className="flex items-start gap-3">
        {previousHref ? (
          <Link
            href={previousHref}
            aria-label="Previous week"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0 mt-1"
          >
            ←
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 border-b border-dotted border-ember-700 hover:text-ink hover:border-ink"
          >
            {journey ? journey.breadcrumb : `Soul Dust Revival · ${shortBookLabel}`} · {weekLabel} ▾
          </button>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink mt-0.5">{weekTitle}</h1>
          <p className="font-serif italic text-moss">{content.subtitle}</p>
        </div>

        <div className="relative w-14 h-14 shrink-0" aria-label="Week progress">
          <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
            <circle cx="20" cy="20" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-dusk/15" />
            <circle
              cx="20"
              cy="20"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-ember transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-sans font-bold text-xs text-ink tabular-nums">
            {percent}%
          </span>
        </div>

        {nextHref ? (
          <Link
            href={nextHref}
            aria-label="Next week"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0 mt-1"
          >
            →
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
      </div>

      <ScrollFadeTabs ariaLabel="Week sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-sans font-semibold border-b-2 -mb-px whitespace-nowrap min-h-[44px] ${
              tab === t.key ? "border-ember text-ink" : "border-transparent text-moss hover:text-ink"
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full border ${
                done.has(t.key) ? "bg-moss border-moss" : "border-moss/40"
              }`}
            />
            {t.label}
          </button>
        ))}
      </ScrollFadeTabs>

      {/* Every panel stays mounted (hidden, not removed) across tab switches --
          matching soul-dust-interactive's own study_template.html, which
          toggles a `hidden` attribute rather than tearing panels down. That
          keeps the Work the Word stepper's position and in-progress answers
          intact when a reader bounces between tabs, instead of resetting on
          every switch. */}
      <div role="tabpanel" hidden={tab !== "study"}>
        <StudyTab
          lessonId={lessonId}
          content={content}
          isDone={done.has("study")}
          onSetDone={(v) => setDone("study", v)}
        />
      </div>
      {showPassage && (
        <div role="tabpanel" hidden={tab !== "passage"}>
          <PassageTab
            content={content}
            onOpenGreek={setGreekStationRef}
            isDone={done.has("passage")}
            onSetDone={(v) => setDone("passage", v)}
          />
        </div>
      )}
      <div role="tabpanel" hidden={tab !== "work"}>
        <WorkTheWordTab
          content={content}
          initialAnswers={initialAnswers}
          current={workStationIndex}
          onCurrentChange={setWorkStationIndex}
          onAllStationsDone={() => setDone("work", true)}
          onAdvanceToLive={() => setTab("live")}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "live"}>
        <LiveItTab
          lessonId={lessonId}
          weekLabel={weekLabel}
          content={content}
          isDone={done.has("live")}
          onSetDone={(v) => setDone("live", v)}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "lift"}>
        <LiftUpTab
          lessonId={lessonId}
          content={content}
          initialStatus={initialStatus}
          nextHref={journey ? journey.continueHref : nextHref}
          nextLabel={journey ? (journey.continueHref === journey.homeHref ? "Back to The Journey →" : "Next week →") : undefined}
          keepCompleted={!!journey}
          isDone={done.has("lift")}
          onSetDone={(v) => setDone("lift", v)}
        />
      </div>

      {greekStation && (
        <GreekSheet
          station={greekStation}
          onClose={() => setGreekStationRef(null)}
          onGoToStation={() => goToStation(greekStation.ref)}
        />
      )}

      {pickerOpen && (
        <WeekPickerSheet
          bookLabel={journey ? "The Journey" : shortBookLabel}
          heading={journey?.pickerHeading}
          weeks={weeks}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
    </WeekMediaContext.Provider>
  );
}
