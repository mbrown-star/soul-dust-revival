"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BlockEditor, ContentBlockData } from "./BlockEditor";

function SortableItem({
  block,
  index,
  total,
  onChange,
  onDelete,
  onMove,
}: {
  block: ContentBlockData;
  index: number;
  total: number;
  onChange: (updated: ContentBlockData) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2">
      {/* Drag handle works for pointer and keyboard users via dnd-kit's
          keyboard sensor (Space to pick up, arrows to move, Space to drop). */}
      <div
        {...attributes}
        {...listeners}
        role="button"
        aria-label={`Drag to reorder ${block.type} block, position ${index + 1} of ${total}`}
        className="cursor-grab flex items-center justify-center w-11 h-11 mt-2 text-neutral-400 text-lg select-none touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900 rounded"
      >
        ⠿
      </div>

      {/* Explicit move buttons as a guaranteed-accessible alternative to drag —
          not everyone can reliably operate drag interactions even via keyboard,
          so a direct "move up/down" action is kept as a first-class option,
          not just a fallback bolted on afterward. */}
      <div className="flex flex-col gap-1 pt-4">
        <button
          type="button"
          onClick={() => onMove("up")}
          disabled={index === 0}
          aria-label={`Move ${block.type} block up`}
          className="flex items-center justify-center w-11 h-8 text-sm border rounded disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove("down")}
          disabled={index === total - 1}
          aria-label={`Move ${block.type} block down`}
          className="flex items-center justify-center w-11 h-8 text-sm border rounded disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-900"
        >
          ↓
        </button>
      </div>

      <div className="flex-1">
        <BlockEditor block={block} onChange={onChange} onDelete={onDelete} />
      </div>
    </div>
  );
}

export function SortableBlockList({
  blocks,
  setBlocks,
}: {
  blocks: ContentBlockData[];
  setBlocks: (blocks: ContentBlockData[]) => void;
}) {
  const [announcement, setAnnouncement] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    // Enables reordering via keyboard alone: Tab to the handle, Space to pick
    // up, Arrow keys to move, Space to drop, Escape to cancel (WCAG 2.1.1).
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function persistReorder(reordered: ContentBlockData[]) {
    setBlocks(reordered);
    fetch("/api/admin/content-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reorder: reordered.map((b, i) => ({ id: b.id, orderIndex: i })),
      }),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    const reordered = arrayMove(blocks, oldIndex, newIndex);
    persistReorder(reordered);
    setAnnouncement(`Moved block to position ${newIndex + 1} of ${reordered.length}`);
  }

  function handleMove(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= blocks.length) return;
    const reordered = arrayMove(blocks, index, newIndex);
    persistReorder(reordered);
    setAnnouncement(`Moved block to position ${newIndex + 1} of ${reordered.length}`);
  }

  function updateBlock(updated: ContentBlockData) {
    setBlocks(blocks.map((b) => (b.id === updated.id ? updated : b)));
  }

  async function deleteBlock(id: string) {
    setBlocks(blocks.filter((b) => b.id !== id));
    await fetch("/api/admin/content-blocks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-4">
          {blocks.map((block, index) => (
            <SortableItem
              key={block.id}
              block={block}
              index={index}
              total={blocks.length}
              onChange={updateBlock}
              onDelete={() => deleteBlock(block.id)}
              onMove={(direction) => handleMove(index, direction)}
            />
          ))}
        </div>
      </SortableContext>
      {/* Announces reorder results to screen reader users, since the visual
          reflow alone isn't perceivable non-visually (WCAG 4.1.3 Status Messages). */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </DndContext>
  );
}
