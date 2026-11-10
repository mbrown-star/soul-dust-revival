import { studyWeekContentSchema } from "@/lib/validation/schemas";
import type { StudyWeekContent } from "./studyContent";

export const STUDY_TABS = [
  { id: "study", label: "Study" },
  { id: "passage", label: "Passage" },
  { id: "work", label: "Work the Word" },
  { id: "live", label: "Live It" },
  { id: "lift", label: "Lift Up" },
] as const;
export type StudyTabId = (typeof STUDY_TABS)[number]["id"];

// Which reader tab each top-level field renders in -- the builder groups
// fields the same way, so an admin edits a field where readers will see it.
const TAB_OF_FIELD: Record<keyof StudyWeekContent, StudyTabId> = {
  subtitle: "study",
  keyVerse: "study",
  keyRef: "study",
  study: "study",
  passageRef: "passage",
  passage: "passage",
  stationsLabel: "work",
  stationsIntro: "work",
  stations: "work",
  lifeTitle: "live",
  lifeIntro: "live",
  practices: "live",
  prayerLead: "live",
  prayerBeats: "live",
  prayerClose: "live",
  bottomLine: "live",
  benediction: "lift",
  closingVerse: "lift",
  closingRef: "lift",
  carry: "lift",
};

export function emptyStudyWeekContent(): StudyWeekContent {
  return {
    subtitle: "",
    keyVerse: "",
    keyRef: "",
    study: { sections: [], parts: [] },
    passageRef: "",
    passage: [],
    stationsLabel: "Work the Word",
    stationsIntro: "",
    stations: [],
    lifeTitle: "",
    lifeIntro: "",
    practices: [],
    prayerLead: "",
    prayerBeats: [],
    prayerClose: "",
    bottomLine: [],
    benediction: [],
    closingVerse: "",
    closingRef: "",
    carry: "",
  };
}

export type StudyContentIssues = {
  valid: boolean;
  /** Dotted path (e.g. "stations.0.ref") -> message to show at that field. */
  byPath: Map<string, string>;
  countByTab: Record<StudyTabId, number>;
};

/**
 * Validates a week against the same schema the API enforces, and maps each
 * problem back to the field and reader tab it belongs to. The builder only
 * autosaves a week that passes, so this is also what tells an admin why a
 * week isn't saving yet.
 */
export function studyContentIssues(content: StudyWeekContent): StudyContentIssues {
  const countByTab: Record<StudyTabId, number> = { study: 0, passage: 0, work: 0, live: 0, lift: 0 };
  const byPath = new Map<string, string>();
  const result = studyWeekContentSchema.safeParse(content);
  if (result.success) return { valid: true, byPath, countByTab };

  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    const message = issue.code === "too_small" && issue.origin === "string" ? "Required" : issue.message;
    if (!byPath.has(path)) byPath.set(path, message);
    const tab = TAB_OF_FIELD[issue.path[0] as keyof StudyWeekContent];
    if (tab) countByTab[tab] += 1;
  }
  return { valid: false, byPath, countByTab };
}

/** Count of issues whose path starts with `prefix` (e.g. "stations.2."). */
export function issuesUnder(issues: StudyContentIssues, prefix: string): number {
  let count = 0;
  for (const path of issues.byPath.keys()) if (path.startsWith(prefix)) count += 1;
  return count;
}
