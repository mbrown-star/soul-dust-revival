/**
 * Filtering and search for the Store and My Library list pages. Pure
 * functions, shared by both pages' client filter UI and the server-side
 * reading of the URL (`?type=study&status=completed&q=psalm`), so a link
 * with filters in it renders already filtered.
 */

export const KIND_FILTERS = ["all", "book", "devotional", "study"] as const;
export type KindFilter = (typeof KIND_FILTERS)[number];

export const STATUS_FILTERS = ["all", "in_progress", "not_started", "completed"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export type CatalogKind = Exclude<KindFilter, "all">;
export type CatalogStatus = Exclude<StatusFilter, "all">;

export type CatalogFilterState = {
  kind: KindFilter;
  status: StatusFilter;
  query: string;
};

export const KIND_FILTER_LABEL: Record<KindFilter, string> = {
  all: "All",
  book: "Books",
  devotional: "Devotionals",
  study: "Studies",
};

export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All",
  in_progress: "In progress",
  not_started: "Not started",
  completed: "Completed",
};

/** Longest search a visitor can type; anything past it is dropped. */
export const MAX_QUERY_LENGTH = 100;

export type CatalogSearchParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(allowed: readonly T[], value: string | undefined): T {
  return allowed.includes(value as T) ? (value as T) : allowed[0]!;
}

/** Reads filters from a page's search params. Unknown values fall back to "all". */
export function parseCatalogFilters(params: CatalogSearchParams): CatalogFilterState {
  return {
    kind: pick(KIND_FILTERS, firstParam(params.type)),
    status: pick(STATUS_FILTERS, firstParam(params.status)),
    query: (firstParam(params.q) ?? "").slice(0, MAX_QUERY_LENGTH),
  };
}

/** The query string for a filter state, leaving out anything at its default. */
export function catalogFilterQueryString(state: CatalogFilterState): string {
  const params = new URLSearchParams();
  if (state.kind !== "all") params.set("type", state.kind);
  if (state.status !== "all") params.set("status", state.status);
  const query = state.query.trim();
  if (query) params.set("q", query);
  const str = params.toString();
  return str ? `?${str}` : "";
}

/** Lowercased, accents removed, whitespace collapsed. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type CatalogItem = {
  kind: CatalogKind;
  /** Only the library has a reading status. */
  status?: CatalogStatus;
  /** Everything a visitor might search for (title, description, label), already normalized. */
  searchText: string;
};

/**
 * True when an item passes every active filter. Search matches when every
 * word typed appears somewhere in the item's text, in any order, so
 * "psalms devotional" finds "365 Days of Psalms Devotional".
 */
export function matchesCatalogFilter(item: CatalogItem, state: CatalogFilterState): boolean {
  if (state.kind !== "all" && item.kind !== state.kind) return false;
  if (state.status !== "all" && item.status !== state.status) return false;
  const terms = normalizeSearchText(state.query).split(" ").filter(Boolean);
  return terms.every((term) => item.searchText.includes(term));
}
