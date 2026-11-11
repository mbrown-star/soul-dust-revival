"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { weekdayName } from "@/lib/journey/schedule";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const noopSubscribe = () => () => {};

/**
 * Picks the reader's Journey day: beginning the Journey ("begin"), or moving
 * an already-begun Journey to another weekday ("change"). The reader's own
 * time zone goes with a begin, so each week opens on his calendar.
 */
export function JourneyDayForm({
  journeyId,
  mode,
  currentWeekday,
}: {
  journeyId: string;
  mode: "begin" | "change";
  currentWeekday?: number;
}) {
  const router = useRouter();
  const groupId = useId();
  // Today's weekday is only known in the browser (the server can't know the
  // reader's time zone); a new Journey defaults to it once hydrated.
  const todayWeekday = useSyncExternalStore(
    noopSubscribe,
    () => new Date().getDay(),
    () => null
  );
  const [chosen, setWeekday] = useState<number | null>(currentWeekday ?? null);
  const weekday = chosen ?? todayWeekday;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (weekday === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/journey/enrollment", {
        method: mode === "begin" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "begin"
            ? { journeyId, weekday, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
            : { journeyId, weekday }
        ),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Couldn't save — please try again.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  const unchanged = mode === "change" && weekday === currentWeekday;

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="font-sans font-semibold text-sm text-ink">
          {mode === "begin" ? "Choose your Journey day" : "Your Journey day"}
        </legend>
        <p id={`${groupId}-hint`} className="font-serif text-sm text-moss mt-1">
          {mode === "begin"
            ? "Each week of the Journey opens on this day. Pick the day you can give it your best attention."
            : "Weeks already open stay open. The next week opens on your new day, never sooner than a week after the last."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2" aria-describedby={`${groupId}-hint`}>
          {WEEKDAYS.map((day) => (
            <label
              key={day}
              className={`flex items-center justify-center min-h-[44px] px-3 rounded-full border font-sans text-sm cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
                weekday === day ? "bg-ink text-parchment border-ink" : "border-moss/30 text-ink hover:border-moss/60"
              }`}
            >
              <input
                type="radio"
                name={`${groupId}-weekday`}
                value={day}
                checked={weekday === day}
                onChange={() => setWeekday(day)}
                className="sr-only"
              />
              {weekdayName(day)}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={saving || weekday === null || unchanged}
        className="min-h-[44px] px-6 rounded-full bg-ember-700 text-parchment font-sans font-semibold text-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : mode === "begin" ? "Begin the Journey" : "Change my Journey day"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </form>
  );
}
