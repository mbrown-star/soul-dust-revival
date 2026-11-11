import { describe, it, expect } from "vitest";
import { splitWordStudyCallout } from "./splitWordStudyCallout";

const p = (...lines: string[]) => lines.map((l) => `<p>${l}</p>`).join("\n");

describe("splitWordStudyCallout", () => {
  it("ends the word study after an inline LIVE IT line (Parts Two-Four)", () => {
    const body = p(
      "Definition and reflection.",
      "LIVE IT: Before you open anything tomorrow, say Psalm 16:8 out loud.",
      "The dust says a real man carries his own life.",
      "<strong>LIFEAPPLICATION · WEEK 37</strong>",
      "1. NAME WHERE YOU CARRY YOUR OWN LIFE"
    );
    expect(splitWordStudyCallout(body)).toEqual({
      callout: p("Definition and reflection.", "LIVE IT: Before you open anything tomorrow, say Psalm 16:8 out loud."),
      rest: p("The dust says a real man carries his own life.", "<strong>LIFEAPPLICATION · WEEK 37</strong>", "1. NAME WHERE YOU CARRY YOUR OWN LIFE"),
    });
  });

  it("keeps the paragraph under a bold LIVEIT label (Part One)", () => {
    const body = p(
      "<strong>Psalm 119:81 · Genesis 2:1</strong>",
      "<strong>LIVEIT</strong>",
      "Write Psalm 119:81 on a card and carry it.",
      "<strong>MOVEMENTONECLOSING</strong>",
      "Looking back.",
      "<strong>LIFEAPPLICATION · WEEK 6</strong>"
    );
    const split = splitWordStudyCallout(body)!;
    expect(split.callout).toBe(p("<strong>Psalm 119:81 · Genesis 2:1</strong>", "<strong>LIVEIT</strong>", "Write Psalm 119:81 on a card and carry it."));
    expect(split.rest).toBe(p("<strong>MOVEMENTONECLOSING</strong>", "Looking back.", "<strong>LIFEAPPLICATION · WEEK 6</strong>"));
  });

  it("uses the last LIVE IT before the heading", () => {
    const body = p("LIVE IT one.", "More study.", "LIVE IT two.", "<strong>LIFEAPPLICATION · WEEK 1</strong>");
    expect(splitWordStudyCallout(body)!.callout).toBe(p("LIVE IT one.", "More study.", "LIVE IT two."));
  });

  it("cuts at the heading when there's no LIVE IT line", () => {
    const body = p("Study.", "<strong>LIFE APPLICATION · WEEK 2</strong>", "Item.");
    expect(splitWordStudyCallout(body)).toEqual({ callout: p("Study."), rest: p("<strong>LIFE APPLICATION · WEEK 2</strong>", "Item.") });
  });

  it("leaves a callout with no Life Application alone, and is a no-op once repaired", () => {
    expect(splitWordStudyCallout(p("Study.", "LIVE IT: do it."))).toBeNull();
    const once = splitWordStudyCallout(p("Study.", "LIVE IT: do it.", "<strong>LIFEAPPLICATION · WEEK 3</strong>"))!;
    expect(splitWordStudyCallout(once.callout)).toBeNull();
  });

  it("refuses HTML that isn't a plain run of paragraphs", () => {
    expect(splitWordStudyCallout(`<p>Study.</p><ul><li>x</li></ul><p>LIFE APPLICATION</p>`)).toBeNull();
    expect(splitWordStudyCallout(p("<strong>LIFEAPPLICATION</strong>", "Item."))).toBeNull();
  });

  it("doesn't cut inside a label-only LIVEIT that sits right before the heading", () => {
    const body = p("Study.", "<strong>LIVEIT</strong>", "<strong>LIFEAPPLICATION · WEEK 4</strong>");
    expect(splitWordStudyCallout(body)!.callout).toBe(p("Study.", "<strong>LIVEIT</strong>"));
  });
});
