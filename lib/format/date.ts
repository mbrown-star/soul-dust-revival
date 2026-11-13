/**
 * The one date style the site shows: "November 5, 2026", in UTC. UTC on both
 * server and browser, so a client component renders the same text the server
 * did (no React #418 hydration error), and an order shows the same day to a
 * reader and in Admin → Sales (staging audit, 2026-11-13).
 */
const DATE = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export function formatDate(value: Date | string): string {
  return DATE.format(typeof value === "string" ? new Date(value) : value);
}

/** "November 5, 2026 at 3:04 PM UTC", for reports that need the time too. */
export function formatDateTime(value: Date | string): string {
  return DATE_TIME.format(typeof value === "string" ? new Date(value) : value);
}
