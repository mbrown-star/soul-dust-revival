"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/Button";
import { BlockCard, StatusPill } from "./BlockCard";
import type { BlockIconName } from "./BlockIcon";
import { SortableRow, dragAnnouncements, dragHandleId, focusDragHandle, useReorderAnnouncer } from "./SortableRow";

export function useBuilderSensors() {
  return useSensors(
    // A small activation distance keeps a click on an input or button inside
    // a draggable row from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

type RemovedItem<T> = { item: T; index: number; key: string; label: string };

const UNDO_WINDOW_MS = 8000;

/**
 * A reorderable list of plain values (no database ids) -- the arrays inside
 * a Study week's structured content. Rows get stable client-side keys so
 * React state and drag ids follow an item as it moves; the keys never leave
 * this component. Owns add/remove (with Undo) so keys stay aligned.
 *
 * `variant="card"` renders each item as a collapsible BlockCard;
 * `variant="compact"` renders a single-line row (paragraphs, verse refs).
 */
export function SortableList<T>({
  items,
  onChange,
  itemLabel,
  renderItem,
  newItem,
  addLabel,
  max,
  variant = "card",
  icon = "text",
  typeLabel,
  summary,
  errorCount,
  canDuplicate = false,
  emptyText,
  addOptions,
  itemIcon,
  itemTypeLabel,
  itemStatus,
  duplicateItem = (item) => structuredClone(item),
}: {
  items: T[];
  onChange: (next: T[]) => void;
  itemLabel: (item: T, index: number) => string;
  renderItem: (item: T, update: (next: T) => void, index: number) => React.ReactNode;
  newItem?: () => T;
  addLabel?: string;
  max?: number;
  variant?: "card" | "compact";
  icon?: BlockIconName;
  typeLabel?: string;
  summary?: (item: T, index: number) => string;
  errorCount?: (index: number) => number;
  canDuplicate?: boolean;
  emptyText?: string;
  /** Several "add" buttons (e.g. one per media type) instead of one newItem. */
  addOptions?: { label: string; newItem: () => T }[];
  /** Per-item icon/type label, for lists that mix item kinds. */
  itemIcon?: (item: T) => BlockIconName;
  itemTypeLabel?: (item: T) => string;
  /** Replaces the default "N to fix" pill on a card. */
  itemStatus?: (item: T, index: number) => React.ReactNode;
  /** How Duplicate copies an item (e.g. to give copies fresh ids). */
  duplicateItem?: (item: T) => T;
}) {
  const listId = useId();
  const counter = useRef(0);
  const [keys, setKeys] = useState<string[]>(() => items.map((_, i) => `${listId}-${i}`));
  // If the parent ever replaces the array with a different length, pad with
  // deterministic keys rather than generating new random ones during render.
  const alignedKeys = items.map((_, i) => keys[i] ?? `${listId}-pad-${i}`);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [removed, setRemoved] = useState<RemovedItem<T> | null>(null);
  const { announce, announcer } = useReorderAnnouncer();
  const sensors = useBuilderSensors();

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  const atMax = max !== undefined && items.length >= max;

  function nextKey() {
    counter.current += 1;
    return `${listId}-n${counter.current}`;
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const key = alignedKeys[from]!;
    setKeys(arrayMove(alignedKeys, from, to));
    onChange(arrayMove(items, from, to));
    announce(`Moved ${itemLabel(items[from]!, from)} to position ${to + 1} of ${items.length}`);
    return key;
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(alignedKeys.indexOf(String(active.id)), alignedKeys.indexOf(String(over.id)));
  }

  function insertAt(index: number, item: T, key = nextKey()) {
    const nextKeys = [...alignedKeys];
    nextKeys.splice(index, 0, key);
    const nextItems = [...items];
    nextItems.splice(index, 0, item);
    setKeys(nextKeys);
    onChange(nextItems);
    setExpanded((s) => new Set(s).add(key));
    return key;
  }

  function remove(index: number) {
    const item = items[index]!;
    setRemoved({ item, index, key: alignedKeys[index]!, label: itemLabel(item, index) });
    setKeys(alignedKeys.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  }

  function undoRemove() {
    if (!removed || atMax) return;
    insertAt(Math.min(removed.index, items.length), removed.item, removed.key);
    setRemoved(null);
  }

  function toggle(key: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <DndContext
        id={listId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements: dragAnnouncements((key) => {
            const index = alignedKeys.indexOf(key);
            return index === -1 ? "item" : itemLabel(items[index]!, index);
          }),
        }}
      >
        <SortableContext items={alignedKeys} strategy={verticalListSortingStrategy}>
          <div className={variant === "card" ? "space-y-3" : "space-y-2"}>
            {items.map((item, index) => {
              const key = alignedKeys[index]!;
              const label = itemLabel(item, index);
              const update = (next: T) => onChange(items.map((it, i) => (i === index ? next : it)));
              const errors = errorCount?.(index) ?? 0;
              return (
                <SortableRow
                  key={key}
                  id={key}
                  label={label}
                  index={index}
                  total={items.length}
                  compact={variant === "compact"}
                  onMove={(direction) => {
                    const movedKey = move(index, direction === "up" ? index - 1 : index + 1);
                    if (movedKey) focusDragHandle(movedKey);
                  }}
                >
                  {variant === "card" ? (
                    <BlockCard
                      icon={itemIcon?.(item) ?? icon}
                      typeLabel={itemTypeLabel?.(item) ?? typeLabel ?? label}
                      summary={summary ? summary(item, index) : label}
                      expanded={expanded.has(key)}
                      onToggle={() => toggle(key)}
                      onDuplicate={canDuplicate && !atMax ? () => insertAt(index + 1, duplicateItem(item)) : undefined}
                      onRemove={() => remove(index)}
                      status={
                        itemStatus ? itemStatus(item, index) : errors > 0 ? <StatusPill tone="error">{errors} to fix</StatusPill> : undefined
                      }
                    >
                      {renderItem(item, update, index)}
                    </BlockCard>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
                      <div className="flex-1 min-w-0">{renderItem(item, update, index)}</div>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        aria-label={`Remove ${label}`}
                        className="self-start text-sm text-error px-2 min-h-[36px] rounded hover:bg-error/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      {announcer}

      {items.length === 0 && emptyText && <p className="text-sm text-moss italic">{emptyText}</p>}

      <div role="status" aria-live="polite" className="min-h-0">
        {removed && (
          <p className="flex items-center gap-3 text-sm text-moss bg-moss/5 rounded-lg px-3 py-2">
            Removed {removed.label}.
            <button
              type="button"
              onClick={undoRemove}
              className="font-medium text-ink underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              Undo
            </button>
          </p>
        )}
      </div>

      {(newItem || addOptions) && (
        <div className="flex flex-wrap items-center gap-2">
          {(addOptions ?? [{ label: addLabel ?? "+ Add", newItem: newItem! }]).map((option) => (
            <Button
              key={option.label}
              variant="secondary"
              size="sm"
              disabled={atMax}
              onClick={() => {
                const key = insertAt(items.length, option.newItem());
                requestAnimationFrame(() => document.getElementById(dragHandleId(key))?.scrollIntoView({ block: "nearest" }));
              }}
            >
              {option.label}
            </Button>
          ))}
          {atMax && <span className="text-xs text-moss">Limit of {max} reached.</span>}
        </div>
      )}
    </div>
  );
}
