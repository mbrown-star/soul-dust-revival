import { describe, expect, it } from "vitest";
import { defaultCoverAltText } from "./coverAltText";

describe("defaultCoverAltText", () => {
  it("combines the title with the side", () => {
    expect(defaultCoverAltText("Colossians: A 12-Week Study", "Front")).toBe(
      "Colossians: A 12-Week Study — Front cover"
    );
    expect(defaultCoverAltText("Colossians: A 12-Week Study", "Back")).toBe(
      "Colossians: A 12-Week Study — Back cover"
    );
  });

  it("trims surrounding whitespace from the title", () => {
    expect(defaultCoverAltText("  Foundations  ", "Front")).toBe("Foundations — Front cover");
  });

  it("falls back to a plain label when the title is empty or only whitespace", () => {
    expect(defaultCoverAltText("", "Front")).toBe("Front cover");
    expect(defaultCoverAltText("   ", "Back")).toBe("Back cover");
  });
});
