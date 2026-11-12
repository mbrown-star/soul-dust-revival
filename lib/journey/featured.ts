import { and, asc, eq } from "drizzle-orm";
import { journeys, products } from "@/lib/db/schema";
import type { getDb } from "@/lib/db/client";
import { loadJourneyMap, type JourneyMap } from "./load";

type Db = Awaited<ReturnType<typeof getDb>>;

export type FeaturedJourneyPart = {
  /** "Part Two — Formed and Sent" */
  label: string;
  /** Week numbers across the whole Journey, e.g. 13 and 24; null when the Part has no weeks yet. */
  firstWeek: number | null;
  lastWeek: number | null;
};

export type FeaturedJourney = {
  title: string;
  product: typeof products.$inferSelect;
  parts: FeaturedJourneyPart[];
  /** Every stop, introductions included: one opens each week. */
  stopCount: number;
};

/**
 * Each Part's week range across the Journey. A Part's first stop is its
 * introduction (a threshold), not a numbered week, so it isn't counted.
 */
export function partWeekRanges(map: Pick<JourneyMap, "parts" | "stops">): FeaturedJourneyPart[] {
  let week = 0;
  return map.parts.map((part) => {
    const weeks = map.stops.filter((s) => s.partIndex === part.index && !s.isThreshold).length;
    const range = weeks > 0 ? { firstWeek: week + 1, lastWeek: week + weeks } : { firstWeek: null, lastWeek: null };
    week += weeks;
    return { label: part.label, ...range };
  });
}

/**
 * The Journey shown at the top of the Store: the oldest published Journey
 * whose bundle is an active product. Null when there's none.
 */
export async function loadFeaturedJourney(db: Db): Promise<FeaturedJourney | null> {
  const [row] = await db
    .select({ journey: journeys, product: products })
    .from(journeys)
    .innerJoin(products, eq(products.id, journeys.bundleProductId))
    .where(and(eq(journeys.published, true), eq(products.active, true)))
    .orderBy(asc(journeys.createdAt))
    .limit(1);
  if (!row) return null;

  const map = await loadJourneyMap(db, row.journey);
  return { title: row.journey.title, product: row.product, parts: partWeekRanges(map), stopCount: map.stops.length };
}
