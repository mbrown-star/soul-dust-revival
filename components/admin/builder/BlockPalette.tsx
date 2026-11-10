"use client";

import { useDraggable } from "@dnd-kit/core";
import type { ContentBlockType } from "@/lib/content/blocks";
import { BlockIcon } from "./BlockIcon";
import { BLOCK_DEFINITIONS, type BlockDefinition } from "./blockRegistry";

export const PALETTE_PREFIX = "palette:";

function PaletteItem({ definition, onAdd }: { definition: BlockDefinition; onAdd: (type: ContentBlockType) => void }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `${PALETTE_PREFIX}${definition.type}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      // Pointer-only drag: Enter/Space keep their normal "click" meaning
      // (append the block), instead of starting a keyboard drag.
      onPointerDown={listeners?.onPointerDown as React.PointerEventHandler<HTMLButtonElement> | undefined}
      onClick={() => onAdd(definition.type)}
      className={`flex items-center gap-3 w-full text-left rounded-lg border border-moss/15 bg-white px-3 py-2 hover:border-ink/40 hover:bg-parchment cursor-grab focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink touch-none ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span className="flex items-center justify-center w-8 h-8 rounded-md bg-parchment text-ember-700 border border-moss/10">
        <BlockIcon name={definition.icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">
          <span className="sr-only">Add </span>
          {definition.label}
          <span className="sr-only"> block</span>
        </span>
        <span className="block text-xs text-moss truncate">{definition.description}</span>
      </span>
    </button>
  );
}

/**
 * Block types grouped by category. Click (or Enter/Space) appends a block;
 * dragging one onto the canvas inserts it where it's dropped.
 */
export function BlockPalette({ onAdd, disabled }: { onAdd: (type: ContentBlockType) => void; disabled?: boolean }) {
  const categories = [...new Set(BLOCK_DEFINITIONS.map((d) => d.category))];
  return (
    <nav aria-label="Add a block" className={disabled ? "pointer-events-none opacity-60" : ""}>
      <p className="text-xs uppercase tracking-wide text-moss mb-2">Add a block</p>
      <p className="text-xs text-moss mb-3 hidden lg:block">Click to add at the end, or drag into place.</p>
      <div className="flex gap-4 overflow-x-auto pb-2 lg:block lg:space-y-4 lg:overflow-visible">
        {categories.map((category) => (
          <div key={category} className="min-w-[11rem] lg:min-w-0">
            <p className="text-xs font-semibold text-ink mb-1.5">{category}</p>
            <ul className="space-y-1.5">
              {BLOCK_DEFINITIONS.filter((d) => d.category === category).map((definition) => (
                <li key={definition.type}>
                  <PaletteItem definition={definition} onAdd={onAdd} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
