import { describe, it, expect } from "vitest";
import { repairIntroHtml, splitRunInSubtitle } from "./introHeadings";
import { splitIntroSections } from "@/lib/study/introSections";

const p = (...lines: string[]) => lines.map((l) => `<p>${l}</p>`).join("\n");

describe("repairIntroHtml", () => {
  const journeyImported = p(
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
    const { html, unknown } = repairIntroHtml(journeyImported)!;
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
    const sections = splitIntroSections(repairIntroHtml(journeyImported)!.html);
    expect(sections.map((s) => s.title)).toEqual(["Foreword", "Preface"]);
  });

  it("makes a How to Use This Study section its own tab, and drops page numerals and the Psalms title page", () => {
    const { html, unknown } = repairIntroHtml(
      p(
        "<strong>FOREWORD</strong>",
        "Brother, before you read.",
        "<strong>MARKETLIFE MINISTRIES</strong>",
        "iii",
        "<strong>PREFACE</strong>",
        "How to Walk This Year This is a long walk.",
        "<strong>HOWTOUSETHISSTUDY</strong>",
        "<strong>THESHAPEOFEACHWEEK</strong>",
        "Each week keeps the same rhythm.",
        "<strong>365 DAYS IN THE PSALMS</strong>"
      )
    )!;
    expect(unknown).toEqual([]);
    expect(html).toBe(
      [
        "<h2>Foreword</h2>",
        "<p>Brother, before you read.</p>",
        "<p><strong>MarketLife Ministries</strong></p>",
        "<h2>Preface</h2>",
        "<p><em>How to Walk This Year</em></p>",
        "<p>This is a long walk.</p>",
        "<h2>How to Use This Study</h2>",
        "<h4>The Shape of Each Week</h4>",
        "<p>Each week keeps the same rhythm.</p>",
      ].join("\n")
    );
    expect(splitIntroSections(html).map((s) => s.title)).toEqual(["Foreword", "Preface", "How to Use This Study"]);
  });

  it("italicizes a section's own bold title line and doesn't repeat a subtitle that matches its heading", () => {
    const { html } = repairIntroHtml(
      p(
        "<strong>PREFACE</strong>",
        "<strong>A Word Before You Begin</strong>",
        "Brother, this book is twelve weeks.",
        "<strong>HOW TO USE THIS WORKBOOK</strong>",
        "How to Use This Workbook Twelve weeks, one subject."
      )
    )!;
    expect(html).toBe(
      [
        "<h2>Preface</h2>",
        "<p><em>A Word Before You Begin</em></p>",
        "<p>Brother, this book is twelve weeks.</p>",
        "<h2>How to Use This Workbook</h2>",
        "<p>Twelve weeks, one subject.</p>",
      ].join("\n")
    );
  });

  it("tidies a verse reference's spaced punctuation", () => {
    const { html } = repairIntroHtml(p("<strong>FOREWORD</strong>", "<strong>PSALM 119 : 25 ( NKJV )</strong>"))!;
    expect(html).toContain("<p><strong>PSALM 119:25 (NKJV)</strong></p>");
  });

  it("repairs section headings already stored as h2s with bold capitals", () => {
    const { html } = repairIntroHtml(
      "<h2><strong>FOREWORD</strong></h2><p>One.</p><h2><strong>PREFACE</strong></h2><p>From Dust to Doxology Every book has a doorway.</p>"
    )!;
    expect(html).toBe(
      ["<h2>Foreword</h2>", "<p>One.</p>", "<h2>Preface</h2>", "<p><em>From Dust to Doxology</em></p>", "<p>Every book has a doorway.</p>"].join("\n")
    );
  });

  it("reports a run-together heading it doesn't know instead of guessing", () => {
    const { unknown } = repairIntroHtml(p("<strong>FOREWORD</strong>", "<strong>THEAFTERWORD</strong>"))!;
    expect(unknown).toEqual(["THEAFTERWORD"]);
  });

  it("is a no-op the second time", () => {
    for (const html of [journeyImported, p("<strong>FOREWORD</strong>", "One.", "<strong>PREFACE</strong>", "Two.")]) {
      expect(repairIntroHtml(repairIntroHtml(html)!.html)).toBeNull();
    }
  });
});

describe("splitRunInSubtitle", () => {
  it.each([
    ["A Word Before the First Page Brother, before you read", "A Word Before the First Page", "Brother, before you read"],
    ["A Word Before the First Page “My soul clings”", "A Word Before the First Page", "“My soul clings”"],
    ["Grace Abounding in the Dust Most men open 1 Timothy", "Grace Abounding in the Dust", "Most men open 1 Timothy"],
    ["The Four Beats of Genesis 1–17 This is a study", "The Four Beats of Genesis 1–17", "This is a study"],
    ["Dusty, and Still Under the Sun This study did not", "Dusty, and Still Under the Sun", "This study did not"],
    ["The Word in the Dust Near the end of his Gospel", "The Word in the Dust", "Near the end of his Gospel"],
    ["Light in the Dust Part One ended at a pool.", "Light in the Dust", "Part One ended at a pool."],
    ["How to Walk This Year This is a long walk.", "How to Walk This Year", "This is a long walk."],
  ])("splits %s", (text, subtitle, rest) => {
    expect(splitRunInSubtitle(text)).toEqual([subtitle, rest]);
  });

  it.each(["Each week is built the same way.", "Most men open 1 Timothy the way they open a manual.", "Brother, before you read."])(
    "leaves an ordinary sentence alone: %s",
    (text) => {
      expect(splitRunInSubtitle(text)).toBeNull();
    }
  );
});
