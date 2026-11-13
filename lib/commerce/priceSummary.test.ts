import { describe, expect, it } from "vitest";
import { priceSummary, storePriceLine } from "./priceSummary";

describe("priceSummary", () => {
  it("names each edition the way the Store does", () => {
    expect(priceSummary({ format: "physical", priceCents: 2500, digitalPriceCents: null })).toBe("Printed $25.00");
    expect(priceSummary({ format: "digital", priceCents: 3000, digitalPriceCents: null })).toBe("Digital $30.00");
    expect(priceSummary({ format: "both", priceCents: 2000, digitalPriceCents: 1500 })).toBe(
      "Printed $20.00 · Digital $15.00"
    );
  });

  it("says so when a printed-and-digital product has no digital price", () => {
    expect(priceSummary({ format: "both", priceCents: 2000, digitalPriceCents: null })).toBe(
      "Printed $20.00 · Digital price not set"
    );
  });
});

describe("storePriceLine", () => {
  it("shows both prices, digital first, for a title sold both ways", () => {
    expect(storePriceLine({ format: "both", priceCents: 9000, digitalPriceCents: 7500 })).toBe(
      "Digital $75.00 · Printed $90.00"
    );
  });

  it("shows the one price for a title sold one way", () => {
    expect(storePriceLine({ format: "physical", priceCents: 2500, digitalPriceCents: null })).toBe("$25.00");
    expect(storePriceLine({ format: "digital", priceCents: 1900, digitalPriceCents: null })).toBe("$19.00");
  });
});
