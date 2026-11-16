"use client";

import { useEffect, useId, useState } from "react";

function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Reads the day's text aloud using the device's own text-to-speech voice
 * (no audio files to host or record) -- quality varies by device, but it
 * needs no server support and works offline once the page has loaded.
 * Devices without speechSynthesis support (rare) just see a button that
 * silently does nothing when clicked, rather than needing client-only state
 * to detect and hide it -- not worth a hydration-mismatch risk for.
 *
 * `hint`, when given, adds an info button beside it whose tooltip says what
 * will be read (the Study tab reads only part of the page). The tooltip opens
 * on hover, keyboard focus or a tap, closes on Escape, and is also the info
 * button's accessible description. It sits to the right from 640px up and
 * below the row on phones, where there's no room beside it.
 */
export function ReadAloudButton({ text, hint }: { text: string; hint?: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const hintId = useId();

  useEffect(() => {
    return () => {
      if (speechSupported()) window.speechSynthesis.cancel();
    };
  }, []);

  function toggle() {
    if (!speechSupported()) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  const button = (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-2 text-sm font-sans border border-moss/30 rounded-full px-4 py-2 min-h-[44px] hover:border-moss/60"
      aria-pressed={speaking}
    >
      <span aria-hidden="true">{speaking ? "⏸" : "▶"}</span>
      {speaking ? "Stop" : "Read it to me"}
    </button>
  );

  if (!hint) return button;

  return (
    <div className="relative inline-flex items-center gap-1">
      {button}
      <button
        type="button"
        aria-label="What does Read it to me read?"
        aria-describedby={hintId}
        aria-expanded={hintOpen}
        onClick={() => setHintOpen(true)}
        onMouseEnter={() => setHintOpen(true)}
        onMouseLeave={() => setHintOpen(false)}
        onFocus={() => setHintOpen(true)}
        onBlur={() => setHintOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setHintOpen(false);
        }}
        className="inline-flex items-center justify-center w-11 h-11 rounded-full text-moss hover:text-ink"
      >
        <span
          aria-hidden="true"
          className="w-5 h-5 rounded-full border border-current flex items-center justify-center font-serif italic text-xs font-bold"
        >
          i
        </span>
      </button>
      <span
        id={hintId}
        role="tooltip"
        className={`${hintOpen ? "block" : "hidden"} absolute z-20 left-0 top-full mt-2 w-full min-w-[16rem] max-w-xs sm:left-full sm:top-1/2 sm:-translate-y-1/2 sm:mt-0 sm:ml-2 sm:w-64 rounded-lg bg-ink text-parchment font-sans text-sm leading-snug px-3 py-2 shadow-lg`}
      >
        {hint}
      </span>
    </div>
  );
}
