/**
 * The social composer asks for a date and time in the admin's own time zone;
 * the server stores and fires schedules in UTC (`timeOfDay` "HH:MM" UTC,
 * `nextRunAt`, a UTC `dayOfWeek`). These convert between the two in the
 * browser, using its time zone.
 *
 * A daily or weekly schedule is fixed in UTC once saved, so across a
 * daylight-saving change it runs an hour earlier or later in local time.
 */

export type LocalSchedule = {
  frequency: "once" | "daily" | "weekly";
  /** Local weekday, 0 = Sunday (weekly only). */
  dayOfWeek?: number;
  /** "YYYY-MM-DD", local. */
  startDate: string;
  /** "HH:MM", local, 24-hour. */
  timeOfDay: string;
  /** "YYYY-MM-DD", local; the last day a recurring post may go out. */
  endDate?: string;
};

export type UtcSchedule = {
  dayOfWeek?: number;
  /** ISO string at UTC midnight of the first run's UTC date. */
  startDate: string;
  /** "HH:MM", UTC. */
  timeOfDay: string;
  /** ISO string at the end of the local end date. */
  endDate?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

function localDateTime(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y!, m! - 1, d!, hh ?? 0, mm ?? 0, 0, 0);
}

function endOfLocalDay(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999);
}

/** The first local run: the start date, moved forward to the chosen weekday for a weekly post. */
export function firstLocalRun(s: LocalSchedule): Date {
  const run = localDateTime(s.startDate, s.timeOfDay);
  if (s.frequency === "weekly" && typeof s.dayOfWeek === "number") {
    run.setDate(run.getDate() + ((s.dayOfWeek - run.getDay() + 7) % 7));
  }
  return run;
}

export function toUtcSchedule(s: LocalSchedule): UtcSchedule {
  const run = firstLocalRun(s);
  const utcMidnight = new Date(Date.UTC(run.getUTCFullYear(), run.getUTCMonth(), run.getUTCDate()));
  return {
    dayOfWeek: s.frequency === "weekly" ? run.getUTCDay() : undefined,
    startDate: utcMidnight.toISOString(),
    timeOfDay: `${pad(run.getUTCHours())}:${pad(run.getUTCMinutes())}`,
    endDate:
      s.frequency !== "once" && s.endDate ? endOfLocalDay(s.endDate).toISOString() : undefined,
  };
}

/** Today as "YYYY-MM-DD" in the browser's time zone. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "America/New_York (EST)" for labels. */
export function localTimeZoneLabel(now = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const short = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;
  return short && short !== zone ? `${zone} (${short})` : zone;
}
