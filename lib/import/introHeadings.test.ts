import { describe, it, expect } from "vitest";
import { repairJourneyIntroHtml } from "./journeyIntroHeadings";
import { splitIntroSections } from "@/lib/journey/introSections";

const p = (...lines: string[]) => lines.map((l) => `<p>${l}</p>`).join("\n");

describe("repairJourneyIntroHtml", () => {
  const imported = p(
    "<strong>FOREWORD</strong>",
    "A Word Before the First Page “My soul clings to the dust; Revive me according to Your word.”",
    "<strong>— Psalm 119:25 (NKJV)</strong>",
    "Brother, before you read a single page…",
    "<strong>The Soul Dust Team</strong>",
    "<strong>MARKETLIFEMINISTRIES</strong>",
    "<strong>MARKETLIFEMINISTRIES</strong>",
    "<strong>PARTTHREE · WEEKS 25 – 36</strong>",
    "<strong>PREFACE</strong>",
    "How to Use This Workbook This workbook is the second of four.",
    "<strong>THEWEEKLYRHYTHM</strong>",
    "Each week is built the same way.",
    "<strong>HOWTOUSE</strong>",
    "<strong>A Few Practical Notes</strong>",
    "<strong>PACING</strong>",
    "Do not try to read a whole week in one sitting.",
    "<strong>XXV</strong>"
  );

  it("turns the front matter into sections and sub-headings with their words back", () => {
    const { html, unknown } = repairJourneyIntroHtml(imported)!;
    expect(unknown).toEqual([]);
    expect(html).toBe(
      [
        "<h2>Foreword</h2>",
        "<p><em>A Word Before the First Page</em></p>",
        "<p>“My soul clings to the dust; Revive me according to Your word.”</p>",
        "<p><strong>— Psalm 119:25 (NKJV)</strong></p>",
        "<p>Brother, before you read a single page…</p>",
        "<p><strong>The Soul Dust Team</strong></p>",
        "<p><strong>MarketLife Ministries</strong></p>",
        "<h2>Preface</h2>",
        "<p><em>How to Use This Workbook</em></p>",
        "<p>This workbook is the second of four.</p>",
        "<h3>The Weekly Rhythm</h3>",
        "<p>Each week is built the same way.</p>",
        "<h3>A Few Practical Notes</h3>",
        "<h4>Pacing</h4>",
        "<p>Do not try to read a whole week in one sitting.</p>",
      ].join("\n")
    );
  });

  it("produces one tab per section", () => {
    const sections = splitIntroSections(repairJourneyIntroHtml(imported)!.html);
    expect(sections.map((s) => s.title)).toEqual(["Foreword", "Preface"]);
  });

  it("reports a run-together heading it doesn't know instead of guessing", () => {
    const { unknown } = repairJourneyIntroHtml(p("<strong>FOREWORD</strong>", "<strong>THEAFTERWORD</strong>"))!;
    expect(unknown).toEqual(["THEAFTERWORD"]);
  });

  it("is a no-op the second time", () => {
    const once = repairJourneyIntroHtml(imported)!.html;
    // Repaired HTML has headings, which aren't the plain <p> run it repairs.
    expect(repairJourneyIntroHtml(once)).toBeNull();
  });
});
