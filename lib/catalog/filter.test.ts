import { describe, expect, it } from "vitest";
import {
  MAX_QUERY_LENGTH,
  catalogFilterQueryString,
  matchesCatalogFilter,
  normalizeSearchText,
  parseCatalogFilters,
  type CatalogItem,
} from "./filter";

const ALL = { kind: "all", status: "all", query: "" } as const;

const psalms: CatalogItem = {
  kind: "devotional",
  status: "in_progress",
  searchText: normalizeSearchText("365 Days of Psalms Devotional for Everyone"),
};
const colossians: CatalogItem = {
  kind: "study",
  status: "completed",
  searchText: normalizeSearchText("Colossians: Rooted in Christ — Study & Digital"),
};

describe("parseCatalogFilters", () => {
  it("defaults everything to all", () => {
    expect(parseCatalogFilters({})).toEqual(ALL);
  });

  it("reads known values", () => {
    expect(parseCatalogFilters({ type: "study", status: "completed", q: "psalm" })).toEqual({
      kind: "study",
      status: "completed",
      query: "psalm",
    });
  });

  it("falls back to all for unknown or repeated values", () => {
    expect(parseCatalogFilters({ type: "bundle", status: ["done", "completed"] })).toEqual(ALL);
    expect(parseCatalogFilters({ type: ["book", "study"] }).kind).toBe("book");
  });

  it("caps an overlong search", () => {
    expect(parseCatalogFilters({ q: "a".repeat(500) }).query).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe("catalogFilterQueryString", () => {
  it("is empty at the defaults", () => {
    expect(catalogFilterQueryString(ALL)).toBe("");
    expect(catalogFilterQueryString({ ...ALL, query: "   " })).toBe("");
  });

  it("round-trips through parseCatalogFilters", () => {
    const state = { kind: "devotional", status: "not_started", query: "dust & grace" } as const;
    const qs = catalogFilterQueryString(state);
    expect(qs).toBe("?type=devotional&status=not_started&q=dust+%26+grace");
    expect(parseCatalogFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(state);
  });
});

describe("matchesCatalogFilter", () => {
  it("passes everything with no filters", () => {
    expect(matchesCatalogFilter(psalms, ALL)).toBe(true);
    expect(matchesCatalogFilter(colossians, ALL)).toBe(true);
  });

  it("filters by type", () => {
    expect(matchesCatalogFilter(psalms, { ...ALL, kind: "devotional" })).toBe(true);
    expect(matchesCatalogFilter(colossians, { ...ALL, kind: "devotional" })).toBe(false);
    expect(matchesCatalogFilter(colossians, { ...ALL, kind: "book" })).toBe(false);
  });

  it("filters by status, and an item with no status never matches a status filter", () => {
    expect(matchesCatalogFilter(colossians, { ...ALL, status: "completed" })).toBe(true);
    expect(matchesCatalogFilter(psalms, { ...ALL, status: "completed" })).toBe(false);
    const storeItem: CatalogItem = { kind: "book", searchText: "revive me" };
    expect(matchesCatalogFilter(storeItem, { ...ALL, status: "not_started" })).toBe(false);
  });

  it("matches every search word in any order, ignoring case and accents", () => {
    expect(matchesCatalogFilter(psalms, { ...ALL, query: "DEVOTIONAL psalms" })).toBe(true);
    expect(matchesCatalogFilter(psalms, { ...ALL, query: "psalms colossians" })).toBe(false);
    const greek: CatalogItem = { kind: "study", searchText: normalizeSearchText("Charis — Grâce") };
    expect(matchesCatalogFilter(greek, { ...ALL, query: "grace" })).toBe(true);
  });

  it("combines filters", () => {
    expect(matchesCatalogFilter(colossians, { kind: "study", status: "completed", query: "rooted" })).toBe(true);
    expect(matchesCatalogFilter(colossians, { kind: "study", status: "in_progress", query: "rooted" })).toBe(false);
  });
});
