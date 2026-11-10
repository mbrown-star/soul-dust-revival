"use client";

import { useEffect, useState } from "react";
import { AutosaveQueue, type AutosaveSave, type AutosaveStatus } from "./autosaveQueue";

/**
 * React wrapper around AutosaveQueue. Pending edits are flushed when the
 * component unmounts and when the page is hidden/unloaded (with keepalive,
 * so the request survives navigation -- the same reason QuestionBlock's own
 * save uses keepalive).
 */
export function useAutosave<P extends object>(save: AutosaveSave<Partial<P>>, delayMs = 600) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queue] = useState(
    () =>
      new AutosaveQueue<P>(save, delayMs, (nextStatus, nextError) => {
        setStatus(nextStatus);
        setError(nextError);
      })
  );

  // The latest save closure (it may capture fresh props/state each render).
  useEffect(() => {
    queue.setSave(save);
  }, [queue, save]);

  useEffect(() => {
    const flushOnHide = () => void queue.flush({ keepalive: true });
    window.addEventListener("pagehide", flushOnHide);
    return () => {
      window.removeEventListener("pagehide", flushOnHide);
      void queue.flush({ keepalive: true });
      queue.dispose();
    };
  }, [queue]);

  return {
    status,
    error,
    schedule: (patch: Partial<P>) => queue.schedule(patch),
    flush: () => queue.flush(),
    retry: () => queue.retry(),
  };
}
