"use client";

import { useId } from "react";
import { BlockIcon, type BlockIconName } from "./BlockIcon";

const actionClass =
  "text-sm px-2 py-1 min-h-[36px] rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

/**
 * Card chrome shared by every block in the builder: icon + type label, a
 * one-line summary that doubles as the expand/collapse toggle, an optional
 * status slot (save state or missing-field count), and Duplicate/Remove.
 */
export function BlockCard({
  icon,
  typeLabel,
  summary,
  expanded,
  onToggle,
  onDuplicate,
  onRemove,
  removeLabel = "Remove",
  status,
  children,
}: {
  icon: BlockIconName;
  typeLabel: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  const bodyId = useId();
  return (
    <div className="border border-moss/15 rounded-lg bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="flex flex-1 min-w-[12rem] items-center gap-3 text-left rounded py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          <span className="flex items-center justify-center w-8 h-8 rounded-md bg-parchment text-ember-700 border border-moss/10">
            <BlockIcon name={icon} />
          </span>
          <span className="min-w-0">
            <span className="block text-xs uppercase tracking-wide text-moss">{typeLabel}</span>
            <span className={`block truncate text-sm ${summary ? "text-ink" : "text-moss italic"}`}>
              {summary || "Empty -- open to edit"}
            </span>
          </span>
          <span aria-hidden="true" className="ml-auto text-moss text-xs">
            {expanded ? "▲" : "▼"}
          </span>
        </button>
        {status}
        <div className="flex items-center gap-1">
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              aria-label={`Duplicate this ${typeLabel.toLowerCase()}`}
              className={`${actionClass} text-moss hover:bg-moss/10`}
            >
              Duplicate
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`${removeLabel} this ${typeLabel.toLowerCase()}`}
              className={`${actionClass} text-error hover:bg-error/10`}
            >
              {removeLabel}
            </button>
          )}
        </div>
      </div>
      <div id={bodyId} hidden={!expanded} className="border-t border-moss/10 p-4 space-y-4">
        {expanded && children}
      </div>
    </div>
  );
}

/** Small pill for a card's status slot. */
export function StatusPill({ tone, children }: { tone: "muted" | "error" | "success"; children: React.ReactNode }) {
  const toneClass =
    tone === "error"
      ? "text-error bg-error/10"
      : tone === "success"
        ? "text-success bg-success/10"
        : "text-moss bg-moss/10";
  return <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${toneClass}`}>{children}</span>;
}
