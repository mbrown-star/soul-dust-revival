import type { StudyWeekContent, WeekMedia, WeekTabId } from "./studyContent";

export const WEEK_TAB_IDS: WeekTabId[] = ["study", "passage", "work", "live", "lift"];

/** Where a media list lives in a week -- also the reader's slot key. */
export type WeekMediaSlot =
  | `section:${number}`
  | `part:${number}`
  | `station:${number}`
  | `practice:${number}`
  | `tab:${WeekTabId}`;

/** Every non-empty media list in a week, keyed by its slot. */
export function weekMediaBySlot(content: StudyWeekContent): Map<WeekMediaSlot, WeekMedia[]> {
  const slots = new Map<WeekMediaSlot, WeekMedia[]>();
  const add = (slot: WeekMediaSlot, media: WeekMedia[] | undefined) => {
    if (media && media.length > 0) slots.set(slot, media);
  };
  content.study.sections.forEach((s, i) => add(`section:${i}`, s.media));
  content.study.parts.forEach((p, i) => add(`part:${i}`, p.media));
  content.stations.forEach((s, i) => add(`station:${i}`, s.media));
  content.practices.forEach((p, i) => add(`practice:${i}`, p.media));
  for (const tab of WEEK_TAB_IDS) add(`tab:${tab}`, content.tabMedia?.[tab]);
  return slots;
}

/** Returns a copy of the week with `fn` applied to every media item. */
export function mapWeekMedia(content: StudyWeekContent, fn: (media: WeekMedia) => WeekMedia): StudyWeekContent {
  const mapList = <T extends { media?: WeekMedia[] }>(item: T): T => (item.media ? { ...item, media: item.media.map(fn) } : item);
  return {
    ...content,
    study: { sections: content.study.sections.map(mapList), parts: content.study.parts.map(mapList) },
    stations: content.stations.map(mapList),
    practices: content.practices.map(mapList),
    tabMedia: content.tabMedia
      ? Object.fromEntries(Object.entries(content.tabMedia).map(([tab, list]) => [tab, list?.map(fn)]))
      : undefined,
  };
}

/** True when an uploaded (Stream) video/audio with this id is in the week. */
export function weekHasStreamMedia(content: StudyWeekContent | null, mediaId: string): boolean {
  if (!content) return false;
  for (const list of weekMediaBySlot(content).values()) {
    if (list.some((m) => m.mediaId === mediaId)) return true;
  }
  return false;
}
