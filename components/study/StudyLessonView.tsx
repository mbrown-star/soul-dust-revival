"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { hasPassage, type StudyWeekContent } from "@/lib/study/studyContent";
import { StudyTab } from "./study-tabs/StudyTab";
import { PassageTab } from "./study-tabs/PassageTab";
import { WorkTheWordTab } from "./study-tabs/WorkTheWordTab";
import { LiveItTab } from "./study-tabs/LiveItTab";
import { LiftUpTab } from "./study-tabs/LiftUpTab";
import { GreekSheet } from "./GreekSheet";
import { WeekPickerSheet, type WeekPickerItem } from "./WeekPickerSheet";
import { useWeekParts } from "./useStudyProgress";
import {
  WEEK_PART_HINTS,
  WEEK_PART_LABELS,
  finishedWeekParts,
  firstUnfinishedPart,
  listPartLabels,
  type WeekPart,
} from "@/lib/study/weekParts";
import { ScrollFadeTabs } from "@/components/ui/ScrollFadeTabs";
import { WeekMediaContext } from "./WeekMediaSlot";
import type { WeekMediaSlot as WeekMediaSlotKey } from "@/lib/study/weekMedia";
import { shortStudyTitle } from "@/lib/study/shortStudyTitle";

const TABS: readonly WeekPart[] = ["study", "passage", "work", "live", "lift"];

// "Week 7: Alive Together with Him" -> { weekLabel: "Week 7", weekTitle: "Alive Together with Him" }
function splitLessonTitle(lessonTitle: string): { weekLabel: string; weekTitle: string } {
  const match = /^(Week \d+):\s*(.*)$/.exec(lessonTitle);
  return match ? { weekLabel: match[1]!, weekTitle: match[2]! } : { weekLabel: lessonTitle, weekTitle: lessonTitle };
}

/**
 * The 5-tab interactive Study reader (Study / Passage / Work the Word /
 * Live It / Lift Up), following the printed order of each week -- see
 * soul-dust-interactive/HANDOFF.md and its own study_template.html for the
 * design this started from (a week picker, a tab per part). Progress is a
 * labelled five-step tracker ("2 of 5 steps done") and numbered tabs that
 * turn into checkmarks, saved on the reader's account (useWeekParts); the
 * week opens on the first unfinished part. Renders only
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
  initialPartsDone,
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
  /** The week's saved status: Lift Up is done when it's "completed". */
  initialStatus: "not_started" | "in_progress" | "completed";
  /** The other parts this reader has finished (lesson_progress.parts_done). */
  initialPartsDone: string[];
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
  const showPassage = hasPassage(content);
  const tabs = TABS.filter((t) => showPassage || t !== "passage");
  // Where the reader left off, from what the server loaded (so the first
  // render matches its HTML).
  const [opening] = useState(() => {
    const done = finishedWeekParts(initialPartsDone, initialStatus === "completed");
    const finished = tabs.filter((t) => done.has(t));
    const next = firstUnfinishedPart(tabs, done);
    return {
      tab: next ?? "study",
      welcome:
        finished.length > 0 && next
          ? `Welcome back. You’ve finished ${listPartLabels(finished)}. Pick up at ${WEEK_PART_LABELS[next]}.`
          : null,
    };
  });
  const [tab, setTab] = useState<WeekPart>(opening.tab);
  const [showWelcome, setShowWelcome] = useState(opening.welcome !== null);
  // Stations are identified by their question block: two can quote the same verse.
  const [greekStationId, setGreekStationId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [workStationIndex, setWorkStationIndex] = useState(0);
  const { done, setPartDone, completed, setCompleted, error } = useWeekParts(
    lessonId,
    initialPartsDone,
    initialStatus === "completed",
    tabs
  );
  const doneCount = tabs.filter((t) => done.has(t)).length;
  const progressLabel = completed
    ? doneCount === tabs.length
      ? "Week complete"
      : `${doneCount} of ${tabs.length} steps done · Week complete`
    : `${doneCount} of ${tabs.length} steps done`;

  function partHint(part: WeekPart) {
    return (
      <p className="mb-5 font-sans text-sm text-moss">
        Step {tabs.indexOf(part) + 1} of {tabs.length} · {WEEK_PART_HINTS[part]}
      </p>
    );
  }
  function openTab(next: WeekPart) {
    setShowWelcome(false);
    setTab(next);
  }
  function markPart(part: WeekPart, value: boolean) {
    setShowWelcome(false);
    void setPartDone(part, value);
  }

  const { weekLabel, weekTitle } = splitLessonTitle(lessonTitle);
  const shortBookLabel = shortStudyTitle(bookLabel);
  const greekStation = content.stations.find((s) => s.questionBlockId === greekStationId) ?? null;

  function goToStation(stationId: string) {
    setGreekStationId(null);
    const index = content.stations.findIndex((s) => s.questionBlockId === stationId);
    if (index !== -1) setWorkStationIndex(index);
    openTab("work");
    requestAnimationFrame(() => {
      document.getElementById(`station-${stationId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <WeekMediaContext.Provider value={media}>
    <div className="space-y-6">
      <Link
        href={journey?.homeHref ?? studyHref}
        className="inline-block text-sm text-moss hover:text-ink underline underline-offset-2"
      >
        {journey ? "← The Journey" : `← ${shortBookLabel}`}
      </Link>

      {/* Under 640px the title gets the full width on its own row, with the
          week arrows and the step tracker on a row beneath it (staging audit). */}
      <div className="flex flex-wrap items-center sm:items-start gap-x-3 gap-y-2">
        {previousHref ? (
          <Link
            href={previousHref}
            aria-label="Previous week"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0 sm:mt-1"
          >
            ←
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}

        <div className="order-first basis-full sm:order-none sm:basis-auto sm:flex-1 min-w-0">
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

        {/* The week's steps, one per tab, always in view (the tab row scrolls
            sideways on a phone). Each step opens its tab. Between the week
            arrows on a phone; its own row under the title from 640px. */}
        <div
          role="group"
          aria-label="This week’s progress"
          className="flex-1 min-w-0 sm:order-last sm:basis-full"
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {tabs.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => openTab(t)}
                  aria-label={`Step ${i + 1}, ${WEEK_PART_LABELS[t]}: ${done.has(t) ? "done" : "not done yet"}`}
                  aria-current={tab === t ? "step" : undefined}
                  className="group flex-1 py-2 min-w-0"
                >
                  <span
                    aria-hidden="true"
                    className={`block h-2 rounded-full transition-colors motion-reduce:transition-none ${
                      done.has(t) ? "bg-moss" : "bg-dusk/15 group-hover:bg-dusk/25"
                    } ${tab === t ? "ring-2 ring-ember ring-offset-2 ring-offset-parchment" : ""}`}
                  />
                </button>
              ))}
            </div>
            <p className="shrink-0 font-sans text-xs font-semibold text-ink tabular-nums" aria-live="polite">
              {progressLabel}
            </p>
          </div>
        </div>

        {nextHref ? (
          <Link
            href={nextHref}
            aria-label="Next week"
            className="flex items-center justify-center w-11 h-11 rounded-full border border-moss/30 hover:border-moss/60 shrink-0 sm:mt-1"
          >
            →
          </Link>
        ) : (
          <span className="w-11 h-11 shrink-0" aria-hidden="true" />
        )}
      </div>

      {showWelcome && opening.welcome && (
        <p className="rounded-lg bg-dusk/5 px-3 py-2 font-sans text-sm text-dusk">{opening.welcome}</p>
      )}
      {error && (
        <p role="alert" className="font-sans text-sm text-error">
          {error}
        </p>
      )}

      <ScrollFadeTabs ariaLabel="Week sections">
        {tabs.map((t, i) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => openTab(t)}
            className={`shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-sans font-semibold border-b-2 -mb-px whitespace-nowrap min-h-[44px] ${
              tab === t ? "border-ember text-ink" : "border-transparent text-moss hover:text-ink"
            }`}
          >
            <span
              aria-hidden="true"
              className={`w-5 h-5 rounded-full border flex items-center justify-center text-[11px] leading-none tabular-nums ${
                done.has(t) ? "bg-moss border-moss text-white" : "border-moss/50 text-moss"
              }`}
            >
              {done.has(t) ? "✓" : i + 1}
            </span>
            {WEEK_PART_LABELS[t]}
            {done.has(t) && <span className="sr-only">(done)</span>}
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
        {partHint("study")}
        <StudyTab
          lessonId={lessonId}
          content={content}
          isDone={done.has("study")}
          onSetDone={(v) => markPart("study", v)}
        />
      </div>
      {showPassage && (
        <div role="tabpanel" hidden={tab !== "passage"}>
          {partHint("passage")}
          <PassageTab
            content={content}
            onOpenGreek={setGreekStationId}
            isDone={done.has("passage")}
            onSetDone={(v) => markPart("passage", v)}
          />
        </div>
      )}
      <div role="tabpanel" hidden={tab !== "work"}>
        {partHint("work")}
        <WorkTheWordTab
          content={content}
          initialAnswers={initialAnswers}
          current={workStationIndex}
          onCurrentChange={setWorkStationIndex}
          onAllStationsDone={() => {
            if (!done.has("work")) markPart("work", true);
          }}
          onAdvanceToLive={() => openTab("live")}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "live"}>
        {partHint("live")}
        <LiveItTab
          lessonId={lessonId}
          weekLabel={weekLabel}
          content={content}
          isDone={done.has("live")}
          onSetDone={(v) => markPart("live", v)}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "lift"}>
        {partHint("lift")}
        <LiftUpTab
          lessonId={lessonId}
          content={content}
          completed={completed}
          onCompletedChange={(v) => {
            setShowWelcome(false);
            setCompleted(v);
          }}
          otherPartsDone={tabs.some((t) => t !== "lift" && done.has(t))}
          nextHref={journey ? journey.continueHref : nextHref}
          nextLabel={journey ? (journey.continueHref === journey.homeHref ? "Back to The Journey →" : "Next week →") : undefined}
          keepCompleted={!!journey}
        />
      </div>

      {greekStation && (
        <GreekSheet
          station={greekStation}
          onClose={() => setGreekStationId(null)}
          onGoToStation={() => goToStation(greekStation.questionBlockId)}
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
