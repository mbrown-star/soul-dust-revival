/**
 * A Journey stop's name wherever the Journey lists it (the trail map, the week
 * picker, My Library's "This week"). A Part's opening stop is its
 * "introduction"; a week title's second colon reads as a dash
 * ("Week 25: Confession & Repentance — An Overview", not "…: An Overview").
 * Staging audit, 2026-11-13.
 */
export function journeyStopTitle(stop: { isThreshold: boolean; label: string; title: string }): string {
  if (stop.isThreshold) return `${stop.label} introduction`;
  const first = stop.title.indexOf(": ");
  if (first === -1) return stop.title;
  const rest = stop.title.slice(first + 2);
  return `${stop.title.slice(0, first + 2)}${rest.replace(/: /g, " — ")}`;
}
