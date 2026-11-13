"use client";

import { useEffect, useRef, useState } from "react";
import type { StudyWeekContent } from "@/lib/study/studyContent";

const TOTAL_SECONDS = 5 * 60;
const BEGIN_PRAYER = "Be still. Come to the Father as you are, through the Son, in the Spirit.";

/**
 * A guided 5-minute prayer: the lead-in, then each Father/Son/Spirit beat in
 * turn, then the close -- evenly spaced across the five minutes (the book
 * gives "keep it to five minutes," not a per-beat duration). Auto-advances
 * on its own timer but can be paused/resumed, since a man praying through
 * this may want to linger on one beat longer than the clock suggests.
 */
export function PrayerTimer({
  lead,
  beats,
  close,
}: {
  lead: string;
  beats: StudyWeekContent["prayerBeats"];
  close: string;
}) {
  // The book's lead-in is an instruction ("Keep it to five minutes."), shown
  // before starting. Once the timer runs, the first step needs words to pray
  // from (staging audit, 2026-11-13).
  const steps = [
    { label: "Begin", body: BEGIN_PRAYER },
    ...beats.map((b) => ({ label: `${b.person}, ${b.verb}`, body: b.words })),
    { label: "Close", body: close },
  ];
  const secondsPerStep = TOTAL_SECONDS / steps.length;

  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function start() {
    setSecondsLeft(TOTAL_SECONDS);
    setStarted(true);
    setRunning(true);
  }

  function reset() {
    setRunning(false);
    setStarted(false);
    setSecondsLeft(TOTAL_SECONDS);
  }

  const elapsed = TOTAL_SECONDS - secondsLeft;
  const stepIndex = Math.min(steps.length - 1, Math.floor(elapsed / secondsPerStep));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progress = (elapsed / TOTAL_SECONDS) * 100;

  return (
    <div className="bg-ink text-parchment rounded-xl p-6 space-y-4">
      <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold">Daily Prayer · 5 Minutes</p>

      {!started ? (
        <>
          <p className="font-serif text-lg">{lead}</p>
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full bg-gold text-ink text-sm font-sans font-semibold"
          >
            Start the prayer
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="h-1.5 bg-parchment/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-gold transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="font-sans text-xs text-parchment/70 tabular-nums">
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")} remaining
          </p>
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold">{steps[stepIndex]!.label}</p>
          <p className="font-serif text-xl" aria-live="polite">
            {steps[stepIndex]!.body}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              disabled={secondsLeft === 0}
              className="min-h-[44px] px-4 rounded-full border border-parchment/30 text-sm font-sans disabled:opacity-50"
            >
              {running ? "Pause" : secondsLeft === 0 ? "Done" : "Resume"}
            </button>
            <button type="button" onClick={reset} className="min-h-[44px] px-4 rounded-full border border-parchment/30 text-sm font-sans">
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
