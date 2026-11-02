"use client";

import { useState, useRef, useEffect, useId } from "react";
import { ContentBlockData } from "./BlockEditor";

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
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function addBlock(type: ContentBlockData["type"]) {
    const res = await fetch("/api/admin/content-blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, type }),
    });
    const block = await res.json();
    onAdd(block);
    setOpen(false);
    buttonRef.current?.focus(); // return focus to the trigger, standard menu-button behavior
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
        className="border border-dashed rounded-lg px-4 py-3 w-full text-neutral-500 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
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
              className="block w-full text-left px-4 py-2 hover:bg-neutral-50 focus:outline-none focus:bg-neutral-50 focus:ring-2 focus:ring-inset focus:ring-neutral-900"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
