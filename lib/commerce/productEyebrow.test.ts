import { describe, expect, it } from "vitest";
import { productEyebrowLabel } from "./productEyebrow";

describe("productEyebrowLabel", () => {
  it("shows a physical-only book as Book", () => {
    expect(productEyebrowLabel({ type: "book", kind: "book", format: "physical" })).toBe("Book");
  });

  it("shows a physical-only Study as Study", () => {
    expect(productEyebrowLabel({ type: "book", kind: "study", format: "physical" })).toBe("Study");
  });

  it("shows a physical-only Devotional as Devotional", () => {
    expect(productEyebrowLabel({ type: "book", kind: "devotional", format: "physical" })).toBe("Devotional");
  });

  it("appends & Digital for a both-format product", () => {
    expect(productEyebrowLabel({ type: "book", kind: "book", format: "both" })).toBe("Book & Digital");
    expect(productEyebrowLabel({ type: "book", kind: "study", format: "both" })).toBe("Study & Digital");
    expect(productEyebrowLabel({ type: "book", kind: "devotional", format: "both" })).toBe(
      "Devotional & Digital"
    );
  });

  it("appends & Digital for a digital-only product", () => {
    expect(productEyebrowLabel({ type: "study_access", kind: "study", format: "digital" })).toBe(
      "Study & Digital"
    );
  });

  it("prefixes a bundle with Bundle", () => {
    expect(productEyebrowLabel({ type: "bundle", kind: "book", format: "physical" })).toBe("Bundle - Book");
    expect(productEyebrowLabel({ type: "bundle", kind: "book", format: "both" })).toBe(
      "Bundle - Book & Digital"
    );
    expect(productEyebrowLabel({ type: "bundle", kind: "study", format: "digital" })).toBe(
      "Bundle - Study & Digital"
    );
  });
});
