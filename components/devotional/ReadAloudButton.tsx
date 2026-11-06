"use client";

import { useEffect, useState } from "react";

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
 */
export function ReadAloudButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);

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

  return (
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
}
