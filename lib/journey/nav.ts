import { canReadStop, formatOpensOn, hasStopOpened } from "./schedule";
import { journeyHref, rhythmOf, type JourneyPart, type JourneyProgress, type JourneyStop } from "./load";
import { journeyStopTitle } from "./stopTitle";

export type JourneyPickerItem = {
  id: string;
  title: string;
  href: string;
  isCurrent: boolean;
  locked: boolean;
  lockedNote?: string;
  group: string;
};

export type JourneyLessonNav = {
  stop: JourneyStop;
  part: JourneyPart;
  homeHref: string;
  previousHref: string | null;
  nextHref: string | null;
  /** Why the next stop isn't a link yet ("Week 18 opens Tuesday, Nov 18"). */
  nextLockNote: string | null;
  /** Where finishing this stop leads: the next stop if its week has come, else home. */
  continueHref: string;
  pickerItems: JourneyPickerItem[];
};

/**
 * Previous/next and the week picker for one lesson, across Part boundaries.
 * An admin previewing (who may not have begun) sees every stop open.
 */
export function journeyLessonNav(progress: JourneyProgress, lessonId: string, isAdminPreview: boolean): JourneyLessonNav | null {
  const index = progress.stops.findIndex((s) => s.lessonId === lessonId);
  if (index === -1) return null;
  const stop = progress.stops[index]!;
  const homeHref = journeyHref(progress.journey);
  const readable = (i: number) => isAdminPreview || (!!progress.states[i] && canReadStop(progress.states[i]!));

  const previous = progress.stops[index - 1];
  const next = progress.stops[index + 1];

  let nextLockNote: string | null = null;
  if (next && !readable(next.index)) {
    const state = progress.states[next.index];
    nextLockNote =
      state?.state === "waiting"
        ? `${next.label} opens ${formatOpensOn(state.opensOn)}.`
        : progress.states[index]?.state === "completed"
          ? `${next.label} opens once you've finished the weeks before it.`
          : `${next.label} opens once you've finished ${stop.label}.`;
  }

  const nextWeekHasCome =
    !!next &&
    (isAdminPreview ||
      (!!progress.enrollment && !!progress.today && hasStopOpened(rhythmOf(progress.enrollment), next.index, progress.today)));

  return {
    stop,
    part: progress.parts[stop.partIndex]!,
    homeHref,
    previousHref: previous && readable(previous.index) ? previous.href : null,
    nextHref: next && readable(next.index) ? next.href : null,
    nextLockNote,
    continueHref: next && nextWeekHasCome ? next.href : homeHref,
    pickerItems: progress.stops.map((s) => {
      const state = progress.states[s.index];
      const locked = !readable(s.index);
      return {
        id: s.lessonId,
        title: journeyStopTitle(s),
        href: s.href,
        isCurrent: s.index === index,
        locked,
        lockedNote: !locked
          ? undefined
          : state?.state === "waiting"
            ? `Opens ${formatOpensOn(state.opensOn)}`
            : "After the weeks before it",
        group: progress.parts[s.partIndex]!.label,
      };
    }),
  };
}
