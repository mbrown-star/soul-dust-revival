"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WeekMediaSlot as SlotKey } from "@/lib/study/weekMedia";

/**
 * Media placed inside a Study week, pre-rendered on the server (so callout
 * HTML is sanitized there) and handed to the client reader tabs keyed by
 * where it goes. Each tab drops a <WeekMediaSlot> wherever media can appear.
 */
export const WeekMediaContext = createContext<Partial<Record<SlotKey, ReactNode>>>({});

export function WeekMediaSlot({ slot, className = "" }: { slot: SlotKey; className?: string }) {
  const node = useContext(WeekMediaContext)[slot];
  return node ? <div className={className}>{node}</div> : null;
}
