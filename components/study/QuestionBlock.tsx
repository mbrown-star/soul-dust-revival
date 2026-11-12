"use client";

import { useState, useId } from "react";

export function QuestionBlock({
  contentBlockId,
  prompt,
  initialAnswer,
  onSaved,
  onAnswerChange,
}: {
  contentBlockId: string;
  prompt: string;
  initialAnswer?: string;
  /** Fired with the current answer text after a successful save -- lets a
   * caller (e.g. the Study reader's Work the Word stepper) track which
   * stations have been answered without this component needing to know why. */
  onSaved?: (answerText: string) => void;
  /** Fired on every edit, so a caller that remounts this block (Work the
   * Word's stepper, moving between stations) can hand the text back as
   * initialAnswer instead of the one the page was loaded with. */
  onAnswerChange?: (answerText: string) => void;
}) {
  const [answer, setAnswer] = useState(initialAnswer ?? "");
  const [saved, setSaved] = useState(false);
  const questionId = useId();

  async function save() {
    // REAL BUG (reported live, not in the original audit): tapping a
    // "Next"/navigation control right after typing blurs the textarea and
    // navigates almost simultaneously -- a plain fetch() in flight at that
    // moment can be silently aborted by the browser once the page starts
    // unloading, so the save never reaches the server even though blur
    // (and therefore this function) did run. `keepalive` exists
    // specifically so a small POST like this one survives navigation/unload
    // instead of racing it. Confirmed worse on mobile, where a tap-to-blur
    // then tap-to-navigate sequence happens faster and with less natural
    // pause than a desktop click.
    await fetch("/api/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentBlockId, answerText: answer }),
      keepalive: true,
    });
    setSaved(true);
    onSaved?.(answer);
  }

  return (
    <div className="space-y-2">
      <label htmlFor={questionId} className="font-medium block">{prompt}</label>
      <textarea
        id={questionId}
        className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value);
          setSaved(false);
          onAnswerChange?.(e.target.value);
        }}
        onBlur={save}
        rows={4}
      />
      {/* Announced to screen readers as it appears, not just visually shown
          (WCAG 4.1.3 Status Messages) — a sighted mouse user sees "Saved"
          appear, but that's silent to a screen reader without this. */}
      <p role="status" aria-live="polite" className="text-sm text-moss h-5">
        {saved ? "Saved" : ""}
      </p>
    </div>
  );
}
