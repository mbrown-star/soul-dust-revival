"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A set of small values kept in localStorage under one key (a week's tabs
 * done, its parts read, its practices checked). Reading progress only the
 * browser has must not change the first render: the server renders "nothing
 * done", and drawing saved progress during hydration made the page differ
 * from the server's HTML (React error #418). useSyncExternalStore renders
 * the server snapshot while hydrating, then the saved one.
 *
 * Every value also lives in memory, so marking things done still works for
 * the visit when localStorage is unavailable (private browsing, storage
 * disabled); it just isn't remembered.
 */

const memory = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null): Set<T> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? new Set(value as T[]) : new Set();
  } catch {
    return new Set();
  }
}

/** The saved set for `key`, read now (client only). */
export function readStoredSet<T>(key: string): Set<T> {
  return parse<T>(readRaw(key));
}

function writeStoredSet<T>(key: string, set: Set<T>) {
  const raw = JSON.stringify([...set]);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Kept in memory for this visit only.
  }
  listeners.get(key)?.forEach((notify) => notify());
}

function subscribe(key: string, notify: () => void) {
  let forKey = listeners.get(key);
  if (!forKey) listeners.set(key, (forKey = new Set()));
  forKey.add(notify);
  // Another tab saving the same week.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return;
    memory.delete(key);
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    forKey.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Returns the saved set and an `update` that takes the current set and
 * returns the next one (return it unchanged to write nothing).
 */
export function useStoredSet<T>(key: string): [Set<T>, (change: (current: Set<T>) => Set<T>) => void] {
  const raw = useSyncExternalStore(
    useCallback((notify: () => void) => subscribe(key, notify), [key]),
    () => readRaw(key),
    () => null
  );
  const set = useMemo(() => parse<T>(raw), [raw]);
  const update = useCallback(
    (change: (current: Set<T>) => Set<T>) => {
      const current = readStoredSet<T>(key);
      const next = change(current);
      if (next !== current) writeStoredSet(key, next);
    },
    [key]
  );
  return [set, update];
}
