/**
 * Given a target that just fired, computes its next run time. 'once' has
 * no next run (the caller should mark it published and stop). Times are
 * always in UTC — timeOfDay is stored as "HH:MM" UTC, matching what the
 * composer collects.
 */
export function computeNextRun(
  previousRun: Date,
  frequency: "once" | "daily" | "weekly",
  dayOfWeek?: number | null
): Date | null {
  if (frequency === "once") return null;

  // previousRun is already set to the correct hour/minute (that's what
  // nextRunAt stores) — read it directly rather than re-parsing a string,
  // which is both simpler and avoids an unnecessary possibly-undefined case.
  const hours = previousRun.getUTCHours();
  const minutes = previousRun.getUTCMinutes();

  if (frequency === "daily") {
    const next = new Date(previousRun);
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(hours, minutes, 0, 0);
    return next;
  }

  // weekly
  const next = new Date(previousRun);
  next.setUTCDate(next.getUTCDate() + 7);
  next.setUTCHours(hours, minutes, 0, 0);
  if (typeof dayOfWeek === "number") {
    // Nudge to the exact target weekday in case of any drift — belt and
    // suspenders alongside the +7 day step above.
    const diff = (dayOfWeek - next.getUTCDay() + 7) % 7;
    next.setUTCDate(next.getUTCDate() + diff);
  }
  return next;
}
