import { describe, it, expect } from "vitest";
import { withSectionedIntroduction } from "./parseStudyDocument";

describe("withSectionedIntroduction", () => {
  const body = "<p><strong>FOREWORD</strong></p>\n<p>One.</p>\n<p><strong>PREFACE</strong></p>\n<p>Two.</p>";

  it("gives an imported Introduction section headings", () => {
    const lesson = withSectionedIntroduction({ title: "Introduction", blocks: [{ type: "text", body }] });
    expect(lesson.blocks).toEqual([
      { type: "text", body: "<h2>Foreword</h2>\n<p>One.</p>\n<h2>Preface</h2>\n<p>Two.</p>" },
    ]);
  });

  it("leaves every other lesson as imported", () => {
    const week = { title: "Week 1: Grace", blocks: [{ type: "text" as const, body }] };
    expect(withSectionedIntroduction(week)).toBe(week);
  });
});
