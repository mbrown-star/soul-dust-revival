import { describe, expect, it } from "vitest";
import type { StudyWeekContent, WeekMedia } from "./studyContent";
import { emptyStudyWeekContent } from "./studyContentIssues";
import { mapWeekMedia, weekHasStreamMedia, weekMediaBySlot } from "./weekMedia";

const image = (id: string): WeekMedia => ({ id, type: "image", imageUrl: "https://example.com/a.png" });

function week(): StudyWeekContent {
  return {
    ...emptyStudyWeekContent(),
    study: {
      sections: [{ heading: "A", paras: [], media: [image("s0")] }, { heading: "B", paras: [] }],
      parts: [{ label: "Part 1", heading: "P", paras: [], media: [{ id: "p0", type: "video", mediaId: "uid-1" }] }],
    },
    practices: [{ n: 1, title: "T", body: "", media: [image("pr0")] }],
    tabMedia: { lift: [{ id: "t0", type: "audio", mediaUrl: "https://example.com/a.mp3" }], live: [] },
  };
}

describe("weekMediaBySlot", () => {
  it("keys every non-empty media list by where it goes, skipping empty ones", () => {
    const slots = weekMediaBySlot(week());
    expect([...slots.keys()].sort()).toEqual(["part:0", "practice:0", "section:0", "tab:lift"]);
  });
});

describe("mapWeekMedia", () => {
  it("applies the function to media in every location and leaves the rest untouched", () => {
    const mapped = mapWeekMedia(week(), (m) => ({ ...m, imageAlt: "seen" }));
    const all = [...weekMediaBySlot(mapped).values()].flat();
    expect(all).toHaveLength(4);
    expect(all.every((m) => m.imageAlt === "seen")).toBe(true);
    expect(mapped.study.sections[1]).toEqual({ heading: "B", paras: [] });
  });
});

describe("weekHasStreamMedia", () => {
  it("finds an uploaded media id anywhere in the week, and nothing else", () => {
    expect(weekHasStreamMedia(week(), "uid-1")).toBe(true);
    expect(weekHasStreamMedia(week(), "uid-2")).toBe(false);
    expect(weekHasStreamMedia(null, "uid-1")).toBe(false);
  });
});
