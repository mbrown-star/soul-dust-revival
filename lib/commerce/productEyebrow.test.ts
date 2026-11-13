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

  it("prefixes a bundle with Bundle and pluralizes its kind", () => {
    expect(productEyebrowLabel({ type: "bundle", kind: "book", format: "physical" })).toBe("Bundle - Books");
    expect(productEyebrowLabel({ type: "bundle", kind: "book", format: "both" })).toBe(
      "Bundle - Books & Digital"
    );
    expect(productEyebrowLabel({ type: "bundle", kind: "study", format: "both" })).toBe(
      "Bundle - Studies & Digital"
    );
    expect(productEyebrowLabel({ type: "bundle", kind: "devotional", format: "digital" })).toBe(
      "Bundle - Devotionals & Digital"
    );
  });

  // Audit 2026-11-13: Parts One to Four read "Study" while their pages promise
  // the digital edition too.
  it("adds & Digital for a printed title that comes with its digital edition", () => {
    expect(productEyebrowLabel({ type: "book", kind: "study", format: "physical", includesDigitalEdition: true })).toBe(
      "Study & Digital"
    );
    expect(productEyebrowLabel({ type: "book", kind: "book", format: "physical", includesDigitalEdition: false })).toBe("Book");
  });
});
