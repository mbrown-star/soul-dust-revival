"use client";

import { useState } from "react";
import type { Announcements } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export function dragHandleId(id: string) {
  return `drag-handle-${id}`;
}

// After a move, the Move up/down button just pressed can become disabled at
// the item's new position, which silently drops keyboard focus to <body>.
// The drag handle is never disabled, so focus goes there instead, once the
// reordered DOM has landed.
export function focusDragHandle(id: string) {
  requestAnimationFrame(() => document.getElementById(dragHandleId(id))?.focus());
}

/**
 * Screen-reader announcements for a drag, in words -- dnd-kit's defaults
 * read out each item's raw id (a database UUID).
 */
export function dragAnnouncements(labelFor: (id: string) => string): Announcements {
  return {
    onDragStart: ({ active }) => `Picked up ${labelFor(String(active.id))}. Use the arrow keys to move, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) =>
      over ? `${labelFor(String(active.id))} is over ${labelFor(String(over.id))}.` : `${labelFor(String(active.id))} is not over a drop position.`,
    onDragEnd: ({ active }) => `Dropped ${labelFor(String(active.id))}.`,
    onDragCancel: ({ active }) => `Cancelled. ${labelFor(String(active.id))} went back to where it was.`,
  };
}

/** Sr-only live region for reorder results (WCAG 4.1.3). */
export function useReorderAnnouncer() {
  const [message, setMessage] = useState("");
  const announcer = (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
  return { announce: setMessage, announcer };
}

const controlClass =
  "flex items-center justify-center text-moss border border-moss/20 rounded bg-white disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

/**
 * One draggable row: a drag handle (pointer, touch, and keyboard via
 * dnd-kit's KeyboardSensor -- Space to pick up, arrows to move, Space to
 * drop, Escape to cancel) plus explicit Move up/down buttons, kept as a
 * first-class alternative since not everyone can operate a drag even by
 * keyboard. Must be rendered inside a SortableContext.
 */
export function SortableRow({
  id,
  label,
  index,
  total,
  onMove,
  compact = false,
  children,
}: {
  id: string;
  label: string;
  index: number;
  total: number;
  onMove: (direction: "up" | "down") => void;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const handle = (
    <div
      {...attributes}
      {...listeners}
      id={dragHandleId(id)}
      role="button"
      aria-label={`Drag to reorder ${label}, position ${index + 1} of ${total}`}
      className={`cursor-grab active:cursor-grabbing flex items-center justify-center text-moss select-none touch-none rounded hover:bg-moss/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink ${
        compact ? "w-9 h-9" : "w-11 h-11 text-lg"
      }`}
    >
      ⠿
    </div>
  );

  const moveButtons = (
    <>
      <button
        type="button"
        onClick={() => onMove("up")}
        disabled={index === 0}
        aria-label={`Move ${label} up`}
        className={`${controlClass} ${compact ? "w-9 h-9" : "w-11 h-8"}`}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => onMove("down")}
        disabled={index === total - 1}
        aria-label={`Move ${label} down`}
        className={`${controlClass} ${compact ? "w-9 h-9" : "w-11 h-8"}`}
      >
        ↓
      </button>
    </>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex gap-2 ${isDragging ? "relative z-10 opacity-70" : ""}`}
    >
      {compact ? (
        <div className="flex items-start gap-1 pt-0.5">
          {handle}
          <div className="flex gap-1">{moveButtons}</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 pt-1">
          {handle}
          {moveButtons}
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
