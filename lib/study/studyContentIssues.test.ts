import { describe, expect, it } from "vitest";
import type { StudyStation } from "./studyContent";
import { emptyStudyWeekContent, issuesUnder, studyContentIssues } from "./studyContentIssues";

function station(overrides: Partial<StudyStation> = {}): StudyStation {
  return {
    ref: "1:2",
    verse: "Grace to you",
    question: "What does grace mean here?",
    questionBlockId: "",
    greek: "",
    translit: "",
    gloss: "",
    xref: "",
    body: [],
    live: "",
    verseNums: [],
    anchor: null,
    ...overrides,
  };
}

describe("studyContentIssues", () => {
  it("counts an empty week's required fields against the reader tab they appear on", () => {
    const issues = studyContentIssues(emptyStudyWeekContent());
    expect(issues.valid).toBe(false);
    expect(issues.byPath.get("keyVerse")).toBe("Required");
    expect(issues.byPath.get("keyRef")).toBe("Required");
    expect(issues.byPath.get("passageRef")).toBe("Required");
    expect(issues.countByTab).toEqual({ study: 2, passage: 1, work: 0, live: 0, lift: 0 });
  });

  it("reports nested problems at their own path, so a card can show its own count", () => {
    const content = {
      ...emptyStudyWeekContent(),
      keyVerse: "v",
      keyRef: "r",
      passageRef: "p",
      stations: [station(), station({ ref: "", question: "" })],
    };
    const issues = studyContentIssues(content);
    expect(issues.byPath.has("stations.1.ref")).toBe(true);
    expect(issuesUnder(issues, "stations.0.")).toBe(0);
    expect(issuesUnder(issues, "stations.1.")).toBe(2);
    expect(issues.countByTab.work).toBe(2);
  });

  it("is valid once the required fields are filled", () => {
    const issues = studyContentIssues({ ...emptyStudyWeekContent(), keyVerse: "v", keyRef: "r", passageRef: "p" });
    expect(issues.valid).toBe(true);
    expect(issues.byPath.size).toBe(0);
  });

  it("counts a problem in a tab's own media against that tab", () => {
    const issues = studyContentIssues({
      ...emptyStudyWeekContent(),
      keyVerse: "v",
      keyRef: "r",
      passageRef: "p",
      tabMedia: { live: [{ id: "11111111-1111-4111-8111-111111111111", type: "image", imageUrl: "http://insecure.example/a.png" }] },
    });
    expect(issues.valid).toBe(false);
    expect(issues.countByTab.live).toBe(1);
    expect(issues.byPath.has("tabMedia.live.0.imageUrl")).toBe(true);
  });
});
