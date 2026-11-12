import { describe, expect, it } from "vitest";
import { promptKey, toWeekContent } from "./backfill-study-content";
import { studyWeekContentSchema } from "@/lib/validation/schemas";

const week = {
  week: 3,
  title: "The Imperishable Seed",
  prayer: "Lord, I am grass.",
  closingIsPull: false,
  subtitle: "from dust to the word that stands",
  keyVerse: "Having been born again…",
  keyRef: "1 PETER 1:23",
  study: { sections: [{ heading: "Where the Dust Lies to You", paras: ["…"] }], parts: [] },
  passageRef: "1 Peter 1:22–25",
  passage: [{ c: 1, n: 22, text: "Seeing you have purified your souls…" }],
  stationsLabel: "THE WORD ON THE IMPERISHABLE SEED",
  stationsIntro: "Read each passage slowly.",
  stations: [],
  lifeTitle: "Where This Meets Real Life",
  lifeIntro: "This week is not about pretending you are not grass.",
  lifePulls: [],
  practices: [{ n: 1, title: "SAY THE HARD SENTENCE OUT LOUD", body: "…" }],
  prayerLead: "",
  prayerBeats: [],
  prayerClose: "",
  prayerLines: ["Lord, I am grass,", "Amen."],
  bottomLine: ["All flesh is grass…"],
  benediction: ["Lift up your eyes…"],
  closingVerse: "The grass withers…",
  closingRef: "1 PETER 1:24–25",
  carry: "What have you been spending your strength defending?",
};

describe("backfill-study-content", () => {
  it("matches a station's question to the imported block despite quotes and line breaks", () => {
    expect(promptKey("Is my love running only as far as comfort allows — or does it stretch?")).toBe(
      promptKey("Is my love running only as far as comfort allows—or does\nit stretch?")
    );
    expect(promptKey("Don’t you see?")).toBe(promptKey("Don't you see?"));
  });

  it("keeps only the reader's fields, and the printed prayer only when there are no timed beats", () => {
    const content = toWeekContent(week, []);
    expect(content).not.toHaveProperty("week");
    expect(content).not.toHaveProperty("prayer");
    expect(content).not.toHaveProperty("closingIsPull");
    expect(content).not.toHaveProperty("lifePulls"); // empty, so left off
    expect(content.prayerLines).toEqual(["Lord, I am grass,", "Amen."]);
    expect(studyWeekContentSchema.safeParse(content).success).toBe(true);

    const journey = toWeekContent(
      {
        ...week,
        passageRef: "",
        passage: [],
        prayerLabel: "A SIMPLE DAILY PRAYER",
        extraPracticals: [{ title: "THE WATCHMAN PRAYER", paras: ["…"] }],
        interlude: { label: "MOVEMENT ONE CLOSING", heading: "Looking Back", paras: ["…"] },
      },
      []
    );
    expect(journey).toMatchObject({ prayerLabel: "A SIMPLE DAILY PRAYER", interlude: { label: "MOVEMENT ONE CLOSING" } });
    expect(journey.extraPracticals).toHaveLength(1);
    expect(studyWeekContentSchema.safeParse(journey).success).toBe(true);

    const timed = toWeekContent(
      { ...week, prayerBeats: [{ person: "Father", verb: "receive", words: "…" }], prayerLead: "Keep it to five minutes." },
      []
    );
    expect(timed).not.toHaveProperty("prayerLines");
  });
});
