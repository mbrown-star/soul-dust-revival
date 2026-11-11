"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  KIND_FILTERS,
  KIND_FILTER_LABEL,
  MAX_QUERY_LENGTH,
  SORT_LABEL,
  SORT_OPTIONS,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  catalogFilterQueryString,
  matchesCatalogFilter,
  sortCatalogItems,
  type CatalogFilterState,
  type CatalogItem,
  type CatalogStatus,
} from "@/lib/catalog/filter";

export type CatalogBrowserItem = CatalogItem & {
  id: string;
  /** The card itself, rendered on the server and passed through untouched. */
  node: ReactNode;
};

/** How long typing pauses before the search is written into the URL. */
const URL_SYNC_DELAY_MS = 400;

/**
 * Search box plus Type (and optionally Status) filters over a list of cards,
 * used by the Store and My Library. Filtering happens in the browser: both
 * lists are small, and it keeps the cards themselves server-rendered. The
 * current filters are mirrored into the URL so reloading, sharing, or coming
 * back to the page keeps them; the page reads the same URL on the server, so
 * it arrives already filtered.
 */
export function CatalogBrowser({
  items,
  initial,
  showStatus = false,
  showSort = false,
  groups,
  gridClassName,
  searchPlaceholder,
  noun,
}: {
  items: CatalogBrowserItem[];
  initial: CatalogFilterState;
  showStatus?: boolean;
  /** Offer the New / Coming Soon / Available Now sort (Store only). */
  showSort?: boolean;
  /** Render matching items in titled sections by status, in this order. */
  groups?: { status: CatalogStatus; title: string }[];
  gridClassName: string;
  searchPlaceholder: string;
  /** Plural word for the items, e.g. "titles", used in the result count. */
  noun: string;
}) {
  const [state, setState] = useState<CatalogFilterState>(initial);
  const searchId = useId();
  const firstSync = useRef(true);

  useEffect(() => {
    // The page already loaded with this URL; nothing to write until a change.
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const url = `${window.location.pathname}${catalogFilterQueryString(state)}${window.location.hash}`;
      try {
        window.history.replaceState(window.history.state, "", url);
      } catch {
        // Some browsers throttle history updates; the filters still work.
      }
    }, URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const visible = useMemo(() => {
    const matching = items.filter((item) => matchesCatalogFilter(item, state));
    return showSort ? sortCatalogItems(matching, state.sort) : matching;
  }, [items, state, showSort]);

  // Each Type option's count reflects the other active filters, so a visitor
  // can see where their search would land before choosing a type.
  const kindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const kind of KIND_FILTERS) {
      counts.set(kind, items.filter((item) => matchesCatalogFilter(item, { ...state, kind })).length);
    }
    return counts;
  }, [items, state]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const status of STATUS_FILTERS) {
      counts.set(status, items.filter((item) => matchesCatalogFilter(item, { ...state, status })).length);
    }
    return counts;
  }, [items, state]);

  const isFiltered = state.kind !== "all" || state.status !== "all" || state.query.trim() !== "";
  // Sorting isn't a filter: clearing filters keeps the chosen order.
  const clear = () => setState((s) => ({ ...s, kind: "all", status: "all", query: "" }));

  return (
    <div>
      <div className="flex flex-col gap-4 mb-8">
        <div>
          <label htmlFor={searchId} className="sr-only">
            Search
          </label>
          <input
            id={searchId}
            type="search"
            value={state.query}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className="w-full sm:max-w-md min-h-[44px] rounded-lg border border-dusk/20 bg-white px-4 py-2 font-sans text-sm text-ink placeholder:text-moss/70 focus:outline-none focus:ring-2 focus:ring-ink"
          />
        </div>

        <FilterGroup
          label="Type"
          options={KIND_FILTERS.map((kind) => ({
            value: kind,
            label: KIND_FILTER_LABEL[kind],
            count: kindCounts.get(kind) ?? 0,
          }))}
          selected={state.kind}
          onSelect={(kind) => setState((s) => ({ ...s, kind }))}
        />

        {showStatus && (
          <FilterGroup
            label="Status"
            options={STATUS_FILTERS.map((status) => ({
              value: status,
              label: STATUS_FILTER_LABEL[status],
              count: statusCounts.get(status) ?? 0,
            }))}
            selected={state.status}
            onSelect={(status) => setState((s) => ({ ...s, status }))}
          />
        )}

        {showSort && (
          <FilterGroup
            label="Sort"
            options={SORT_OPTIONS.map((sort) => ({ value: sort, label: SORT_LABEL[sort] }))}
            selected={state.sort}
            onSelect={(sort) => setState((s) => ({ ...s, sort }))}
          />
        )}

        <div className="flex items-center gap-4 min-h-[24px]">
          <p className="font-sans text-sm text-moss" aria-live="polite" aria-atomic="true">
            {isFiltered ? `Showing ${visible.length} of ${items.length} ${noun}` : ""}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={clear}
              className="font-sans text-sm text-ink underline underline-offset-2 hover:text-moss focus:outline-none focus:ring-2 focus:ring-ink rounded"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-dusk/5 border border-dusk/10 rounded-lg p-8 text-center">
          <p className="font-serif text-moss mb-4">Nothing matches those filters.</p>
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center justify-center bg-ink text-parchment rounded-lg px-5 py-3 font-sans text-sm font-medium min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2"
          >
            Clear filters
          </button>
        </div>
      ) : groups ? (
        <div className="space-y-12">
          {groups.map((group) => {
            const groupItems = visible.filter((item) => item.status === group.status);
            if (groupItems.length === 0) return null;
            return (
              <section key={group.status}>
                <h2 className="font-display font-semibold text-xl text-ink mb-4">{group.title}</h2>
                <div className={gridClassName}>
                  {groupItems.map((item) => (
                    <Fragment key={item.id}>{item.node}</Fragment>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className={gridClassName}>
          {visible.map((item) => (
            <Fragment key={item.id}>{item.node}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  /** Leave out `count` for options that don't narrow the list (sorting). */
  options: { value: T; label: string; count?: number }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="font-sans text-xs uppercase tracking-wide text-moss mr-1 w-14 shrink-0" aria-hidden="true">
        {label}
      </span>
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(option.value)}
            className={`inline-flex items-center gap-1.5 min-h-[44px] rounded-full px-4 font-sans text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-ink focus:ring-offset-2 ${
              isSelected
                ? "bg-ink text-parchment border-ink"
                : "bg-white text-ink border-dusk/20 hover:border-dusk/50"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={isSelected ? "text-parchment/80" : "text-moss"}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
