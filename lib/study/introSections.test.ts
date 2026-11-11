import { describe, it, expect } from "vitest";
import { splitIntroSections } from "./introSections";

describe("splitIntroSections", () => {
  it("makes one section per h2, the heading as its title", () => {
    const html = "<h2>Foreword</h2>\n<p>One.</p>\n<h2>Preface</h2>\n<h3>The Weekly Rhythm</h3>\n<p>Two.</p>";
    expect(splitIntroSections(html)).toEqual([
      { title: "Foreword", html: "<p>One.</p>" },
      { title: "Preface", html: "<h3>The Weekly Rhythm</h3>\n<p>Two.</p>" },
    ]);
  });

  it("keeps anything before the first heading with the first section", () => {
    const html = "<p>Lead.</p><h2>Foreword</h2><p>One.</p><h2>Preface</h2><p>Two.</p>";
    expect(splitIntroSections(html)[0]).toEqual({ title: "Foreword", html: "<p>Lead.</p>\n<p>One.</p>" });
  });

  it("returns nothing to tab between with fewer than two sections", () => {
    expect(splitIntroSections("<h2>Foreword</h2><p>Only.</p>")).toEqual([]);
    expect(splitIntroSections("<p>No headings.</p>")).toEqual([]);
  });

  it("uses the heading's plain text as the title", () => {
    const html = "<h2><strong>Before &amp; After</strong></h2><p>a</p><h2>Preface</h2><p>b</p>";
    expect(splitIntroSections(html)[0]!.title).toBe("Before & After");
  });
});
