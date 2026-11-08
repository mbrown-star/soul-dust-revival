"use client";

import { useState, useRef, useEffect, useId } from "react";
import type { ContentBlockData } from "./BlockEditor";

const BLOCK_TYPES: { value: ContentBlockData["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "question", label: "Question" },
  { value: "callout", label: "Callout / color block" },
];

export function AddBlockButton({
  lessonId,
  onAdd,
}: {
  lessonId: string;
  onAdd: (block: ContentBlockData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function addBlock(type: ContentBlockData["type"]) {
    setOpen(false);
    setError(null);
    try {
      const res = await fetch("/api/admin/content-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, type }),
      });
      // FIXED (found during a manual keyboard-only accessibility pass): a
      // failed request (403 from an expired session, a validation error,
      // a network failure) used to be parsed as if it were a real
      // ContentBlockData and handed to onAdd() unchanged -- the error body
      // has no `type`, so the new block's own drag/move/delete controls
      // rendered as "undefined block" with no indication anything had gone
      // wrong, confusing for a sighted admin and actively misleading for a
      // screen reader user told to "move the undefined block."
      if (!res.ok) throw new Error("add_block_failed");
      const block = (await res.json()) as ContentBlockData;
      onAdd(block);
    } catch {
      setError("Couldn't add that block — please try again.");
    } finally {
      buttonRef.current?.focus(); // return focus to the trigger, standard menu-button behavior
    }
  }

  // Close on Escape, matching standard menu-button keyboard behavior (WAI-ARIA APG).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="border border-dashed rounded-lg px-4 py-3 w-full text-moss hover:border-moss focus:outline-none focus:ring-2 focus:ring-ink"
      >
        + Add block
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Block type"
          className="absolute z-10 bg-white border rounded-lg shadow-lg mt-1 w-56"
        >
          {BLOCK_TYPES.map((t) => (
            <button
              key={t.value}
              role="menuitem"
              onClick={() => addBlock(t.value)}
              className="block w-full text-left px-4 py-2 hover:bg-moss/5 focus:outline-none focus:bg-moss/5 focus:ring-2 focus:ring-inset focus:ring-ink"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-error font-medium mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
