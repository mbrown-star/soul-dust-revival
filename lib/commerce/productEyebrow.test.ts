import { describe, expect, it } from "vitest";
import { productEyebrowLabel, productFormatLabel } from "./productEyebrow";

describe("productFormatLabel", () => {
  it("labels physical as Book", () => {
    expect(productFormatLabel("physical")).toBe("Book");
  });

  it("labels digital as Digital", () => {
    expect(productFormatLabel("digital")).toBe("Digital");
  });

  it("labels both as Book & Digital", () => {
    expect(productFormatLabel("both")).toBe("Book & Digital");
  });
});

describe("productEyebrowLabel", () => {
  it("shows a plain book with no kind/binding as just Book", () => {
    expect(
      productEyebrowLabel({ type: "book", kind: "book", format: "physical", bookBinding: null })
    ).toBe("Book");
  });

  it("shows a digital-only product as just Digital", () => {
    expect(
      productEyebrowLabel({ type: "study_access", kind: "book", format: "digital", bookBinding: null })
    ).toBe("Digital");
  });

  it("shows a both-format product as Book & Digital", () => {
    expect(
      productEyebrowLabel({ type: "book", kind: "book", format: "both", bookBinding: null })
    ).toBe("Book & Digital");
  });

  it("appends the kind for a Study", () => {
    expect(
      productEyebrowLabel({ type: "study_access", kind: "study", format: "physical", bookBinding: null })
    ).toBe("Book - Study");
  });

  it("appends the kind for a Devotional", () => {
    expect(
      productEyebrowLabel({ type: "study_access", kind: "devotional", format: "digital", bookBinding: null })
    ).toBe("Digital - Devotional");
  });

  it("appends binding alone when kind is book", () => {
    expect(
      productEyebrowLabel({ type: "book", kind: "book", format: "physical", bookBinding: "hardback" })
    ).toBe("Book - Hardback");
  });

  it("combines kind and binding", () => {
    expect(
      productEyebrowLabel({ type: "book", kind: "study", format: "both", bookBinding: "softback" })
    ).toBe("Book & Digital - Study, Softback");
  });

  it("shows a bundle's format alone when kind is book", () => {
    expect(
      productEyebrowLabel({ type: "bundle", kind: "book", format: "physical", bookBinding: null })
    ).toBe("Bundle - Book");
  });

  it("combines kind and format for a bundle", () => {
    expect(
      productEyebrowLabel({ type: "bundle", kind: "study", format: "digital", bookBinding: null })
    ).toBe("Bundle - Study & Digital");
  });

  it("shows a both-format bundle's format alone when kind is book", () => {
    expect(
      productEyebrowLabel({ type: "bundle", kind: "book", format: "both", bookBinding: null })
    ).toBe("Bundle - Book & Digital");
  });

  it("includes binding on a bundle alongside kind/format", () => {
    expect(
      productEyebrowLabel({ type: "bundle", kind: "devotional", format: "physical", bookBinding: "softback" })
    ).toBe("Bundle - Devotional & Book, Softback");
  });
});
