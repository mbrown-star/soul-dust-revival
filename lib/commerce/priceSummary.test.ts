import { describe, expect, it } from "vitest";
import { priceSummary } from "./priceSummary";

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
