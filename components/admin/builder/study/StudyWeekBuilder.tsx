"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StudyWeekContent } from "@/lib/study/studyContent";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { STUDY_TABS, studyContentIssues, type StudyTabId } from "@/lib/study/studyContentIssues";
import { ScrollFadeTabs } from "@/components/ui/ScrollFadeTabs";
import { StatusPill } from "../BlockCard";
import { LiftUpPanel, LiveItPanel, PassagePanel, StudyPanel, WorkTheWordPanel, type PanelProps } from "./panels";

type SavePatch = { studyContent: StudyWeekContent };

/**
 * The structured editor for one week of a Study-kind lesson, laid out like
 * the reader: one tab per reader tab, fixed fields as pinned cards, and
 * every list (sections, parts, stations, practices, prayer, lines)
 * reorderable by drag or by Move up/down. Autosaves whenever the week is
 * valid; while it isn't, each tab shows how many fields still need filling.
 */
export function StudyWeekBuilder({
  lessonId,
  initialContent,
  alreadySaved,
}: {
  lessonId: string;
  initialContent: StudyWeekContent;
  /** False for a week that has never been saved yet (started from empty). */
  alreadySaved: boolean;
}) {
  const router = useRouter();
  // Any station still without an answer-block id (older data) gets one now,
  // for the same reason new stations get theirs on creation: the server
  // creates the block under the id the builder already holds.
  const [content, setContent] = useState(() => ({
    ...initialContent,
    stations: initialContent.stations.map((s) => (s.questionBlockId ? s : { ...s, questionBlockId: crypto.randomUUID() })),
  }));
  const [tab, setTab] = useState<StudyTabId>("study");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const savedOnce = useRef(alreadySaved);
  const issues = useMemo(() => studyContentIssues(content), [content]);

  const autosave = useAutosave<SavePatch>(async (patch, { keepalive }) => {
    const res = await fetch("/api/admin/lessons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lessonId, studyContent: patch.studyContent }),
      keepalive,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
      };
      throw new Error(
        data.details?.formErrors?.[0] ?? Object.values(data.details?.fieldErrors ?? {})[0]?.[0] ?? "Check your connection and retry."
      );
    }
    if (!savedOnce.current) {
      savedOnce.current = true;
      // The page's server-rendered parts (which editor shows for this
      // lesson) depend on whether structured content exists yet.
      router.refresh();
    }
  });

  function change(next: StudyWeekContent) {
    setContent(next);
    if (studyContentIssues(next).valid) autosave.schedule({ studyContent: next });
  }

  const panelProps: PanelProps = { content, change, issues };
  const totalIssues = [...issues.byPath.keys()].length;

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = STUDY_TABS[(index + delta + STUDY_TABS.length) % STUDY_TABS.length]!;
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-moss">Laid out like the reader&apos;s five tabs. Changes save automatically.</p>
        <div role="status" aria-live="polite" className="flex items-center gap-2">
          {!issues.valid ? (
            <StatusPill tone="error">
              Not saved yet -- {totalIssues} {totalIssues === 1 ? "field needs" : "fields need"} filling in
            </StatusPill>
          ) : autosave.status === "saving" || autosave.status === "pending" ? (
            <StatusPill tone="muted">Saving…</StatusPill>
          ) : autosave.status === "saved" ? (
            <StatusPill tone="success">All changes saved</StatusPill>
          ) : autosave.status === "error" ? (
            <>
              <StatusPill tone="error">Not saved: {autosave.error}</StatusPill>
              <button type="button" className="text-xs underline text-ink" onClick={() => void autosave.retry()}>
                Retry
              </button>
            </>
          ) : null}
        </div>
      </div>

      <ScrollFadeTabs ariaLabel="Week sections">
        {STUDY_TABS.map((t, index) => {
          const count = issues.countByTab[t.id];
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`week-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`week-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, index)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
                selected ? "border-ink text-ink font-medium" : "border-transparent text-moss hover:text-ink"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className="text-xs rounded-full bg-error/10 text-error px-1.5" aria-label={`${count} to fix`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </ScrollFadeTabs>

      {STUDY_TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`week-panel-${t.id}`} aria-labelledby={`week-tab-${t.id}`} hidden={tab !== t.id} className="space-y-6">
          {t.id === "study" && <StudyPanel {...panelProps} />}
          {t.id === "passage" && <PassagePanel {...panelProps} />}
          {t.id === "work" && <WorkTheWordPanel {...panelProps} />}
          {t.id === "live" && <LiveItPanel {...panelProps} />}
          {t.id === "lift" && <LiftUpPanel {...panelProps} />}
        </div>
      ))}
    </div>
  );
}
