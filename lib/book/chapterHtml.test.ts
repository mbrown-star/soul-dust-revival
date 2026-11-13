import { describe, expect, it } from "vitest";
import { buildBookChapterOpener, parseBookChapterHtml, parseBookLessonTitle } from "./chapterHtml";
import { sanitizeHtml } from "@/lib/sanitize/html";

describe("book chapter opener", () => {
  it("round-trips through the sanitizer that guards every stored block", () => {
    const opener = buildBookChapterOpener({
      part: "Part Four · Turned",
      title: "Forgiven, Forgiving & Free",
      subtitle: "from bitterness to release",
      epigraph: { text: "“Be kind to one another.”", reference: "Ephesians 4:32" },
    });
    const stored = sanitizeHtml(opener + "<h3>Ten thousand talents</h3><p>Body.</p>");
    expect(parseBookChapterHtml(stored)).toEqual({
      part: "Part Four · Turned",
      title: "Forgiven, Forgiving & Free",
      subtitle: "from bitterness to release",
      epigraph: { text: "“Be kind to one another.”", reference: "Ephesians 4:32" },
      bodyHtml: "<h3>Ten thousand talents</h3><p>Body.</p>",
    });
  });

  it("reads an opener with no Part, subtitle or verse", () => {
    expect(parseBookChapterHtml("<h2>From Dust to Glory</h2><p>Body.</p>")).toEqual({
      part: null,
      title: "From Dust to Glory",
      subtitle: null,
      epigraph: null,
      bodyHtml: "<p>Body.</p>",
    });
  });

  it("returns null when the block has been rewritten without its title", () => {
    expect(parseBookChapterHtml("<p>Just some text.</p>")).toBeNull();
  });
});

describe("parseBookLessonTitle", () => {
  it("reads chapters, the epilogue and the introduction", () => {
    expect(parseBookLessonTitle("Chapter 12: Mouth and Mind")).toEqual({
      kind: "chapter",
      number: 12,
      label: "Chapter 12",
      title: "Mouth and Mind",
    });
    expect(parseBookLessonTitle("Epilogue: From Dust to Glory")).toEqual({
      kind: "epilogue",
      label: "Epilogue",
      title: "From Dust to Glory",
    });
    expect(parseBookLessonTitle("Introduction")?.kind).toBe("introduction");
    expect(parseBookLessonTitle("Week 1: Something")).toBeNull();
  });
});
