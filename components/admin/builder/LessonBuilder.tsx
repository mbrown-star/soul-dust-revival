"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FIELDS_BY_TYPE, type ContentBlockData, type ContentBlockType } from "@/lib/content/blocks";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { BlockCard, StatusPill } from "./BlockCard";
import { BlockIcon } from "./BlockIcon";
import { BlockPalette, PALETTE_PREFIX } from "./BlockPalette";
import { BLOCK_DEFINITIONS, BLOCK_DEFINITION_BY_TYPE } from "./blockRegistry";
import { BuilderConfigContext, type StudyKind } from "./blockEditors";
import { useBuilderSensors } from "./SortableList";
import { SortableRow, dragAnnouncements, focusDragHandle, useReorderAnnouncer } from "./SortableRow";

const CANVAS_END = "canvas-end";
const UNDO_WINDOW_MS = 8000;

async function readError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { message?: string; details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } };
    return data.message ?? Object.values(data.details?.fieldErrors ?? {})[0]?.[0] ?? data.details?.formErrors?.[0] ?? fallback;
  } catch {
    return fallback;
  }
}

function fieldsOf(block: ContentBlockData): Partial<ContentBlockData> {
  return Object.fromEntries(FIELDS_BY_TYPE[block.type].map((f) => [f, block[f]]));
}

// Wrapped in a live region so the save result is announced, not just shown.
function SaveState({ status, error, onRetry }: { status: string; error: string | null; onRetry: () => void }) {
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-2">
      {(status === "saving" || status === "pending") && <StatusPill tone="muted">Saving…</StatusPill>}
      {status === "saved" && <StatusPill tone="success">Saved</StatusPill>}
      {status === "error" && (
        <>
          <StatusPill tone="error">Not saved{error ? `: ${error}` : ""}</StatusPill>
          <button type="button" onClick={onRetry} className="text-xs underline text-ink">
            Retry
          </button>
        </>
      )}
    </span>
  );
}

function BlockItem({
  block,
  expanded,
  onToggle,
  onLocalChange,
  onDuplicate,
  onRemove,
}: {
  block: ContentBlockData;
  expanded: boolean;
  onToggle: () => void;
  onLocalChange: (patch: Partial<ContentBlockData>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const definition = BLOCK_DEFINITION_BY_TYPE[block.type];
  const autosave = useAutosave<ContentBlockData>(async (patch, { keepalive }) => {
    const res = await fetch("/api/admin/content-blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: block.id, ...patch }),
      keepalive,
    });
    if (!res.ok) throw new Error(await readError(res, "Check your connection and retry."));
  });

  // The parent merges `patch` into its current copy of the block, so an
  // upload that resolves after further edits can't overwrite them.
  function update(patch: Partial<ContentBlockData>) {
    onLocalChange(patch);
    autosave.schedule(patch);
  }

  const issue = definition.issue(block);
  const saveState = <SaveState status={autosave.status} error={autosave.error} onRetry={() => void autosave.retry()} />;
  const Editor = definition.Editor;

  return (
    <BlockCard
      icon={definition.icon}
      typeLabel={definition.label}
      summary={definition.summary(block)}
      expanded={expanded}
      onToggle={onToggle}
      onDuplicate={onDuplicate}
      onRemove={onRemove}
      status={
        <>
          {saveState}
          {autosave.status === "idle" && issue && <StatusPill tone={issue === "Empty" ? "muted" : "error"}>{issue}</StatusPill>}
        </>
      }
    >
      <Editor block={block} update={update} />
    </BlockCard>
  );
}

function InsertHere({
  index,
  onInsert,
  disabled,
}: {
  index: number;
  onInsert: (type: ContentBlockType, index: number) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  return (
    <div className="flex flex-col items-center py-1 group">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className="text-xs text-moss px-3 py-1 rounded-full border border-dashed border-moss/30 hover:border-ink/40 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
      >
        + Insert here<span className="sr-only">, at position {index + 1}</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="flex flex-wrap justify-center gap-1.5 mt-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          {BLOCK_DEFINITIONS.map((d) => (
            <button
              key={d.type}
              type="button"
              onClick={() => {
                setOpen(false);
                onInsert(d.type, index);
              }}
              className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border border-moss/20 bg-white hover:bg-parchment focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              <BlockIcon name={d.icon} className="w-4 h-4 text-ember-700" />
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasEnd({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_END });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed text-center text-sm py-6 transition-colors ${
        isOver ? "border-ember-700 bg-ember-700/5 text-ink" : active ? "border-moss/30 text-moss" : "border-transparent text-transparent"
      }`}
      aria-hidden="true"
    >
      Drop here to add at the end
    </div>
  );
}

/**
 * The drag-and-drop canvas for a lesson's content blocks: a palette of
 * block types, a reorderable stack of collapsible block cards, and per-block
 * autosave. Used for devotional lessons and any Study lesson that doesn't
 * use the structured week builder.
 */
export function LessonBuilder({
  lessonId,
  initialBlocks,
  studyKind,
  r2PublicBaseUrl,
}: {
  lessonId: string;
  initialBlocks: ContentBlockData[];
  studyKind: StudyKind;
  r2PublicBaseUrl?: string;
}) {
  const router = useRouter();
  const contextId = useId();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialBlocks.length <= 3 ? initialBlocks.map((b) => b.id) : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ block: ContentBlockData; index: number } | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { announce, announcer } = useReorderAnnouncer();
  const sensors = useBuilderSensors();

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [removed]);

  async function createBlock(type: ContentBlockType, index: number, initial?: Partial<ContentBlockData>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/content-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, type, insertAt: index, initial }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't add the block."));
      const block = (await res.json()) as ContentBlockData;
      setBlocks((current) => {
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, block);
        return next;
      });
      setExpanded((s) => new Set(s).add(block.id));
      announce(`Added ${BLOCK_DEFINITION_BY_TYPE[type].label} block at position ${index + 1}`);
      focusDragHandle(block.id);
      return block;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the block.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(next: ContentBlockData[], previous: ContentBlockData[]) {
    setBlocks(next);
    try {
      const res = await fetch("/api/admin/content-blocks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder: next.map((b, i) => ({ id: b.id, orderIndex: i })) }),
      });
      if (!res.ok) throw new Error(await readError(res, "Couldn't save the new order."));
    } catch (err) {
      // Restore the previous order without dropping a block created while
      // this request was in flight.
      const previousIndex = new Map(previous.map((b, i) => [b.id, i]));
      setBlocks((current) =>
        [...current].sort((a, b) => (previousIndex.get(a.id) ?? Infinity) - (previousIndex.get(b.id) ?? Infinity))
      );
      setError(err instanceof Error ? err.message : "Couldn't save the new order.");
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= blocks.length || from === to) return;
    const moved = blocks[from]!;
    void persistOrder(arrayMove(blocks, from, to), blocks);
    announce(`Moved ${BLOCK_DEFINITION_BY_TYPE[moved.type].label} block to position ${to + 1} of ${blocks.length}`);
    return moved.id;
  }

  async function remove(index: number) {
    const block = blocks[index]!;
    setError(null);
    const res = await fetch("/api/admin/content-blocks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: block.id }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError(res ? await readError(res, "Couldn't remove the block.") : "Couldn't remove the block. Check your connection.");
      return;
    }
    setBlocks((current) => current.filter((b) => b.id !== block.id));
    setRemoved({ block, index });
  }

  async function undoRemove() {
    if (!removed) return;
    const { block, index } = removed;
    setRemoved(null);
    await createBlock(block.type, index, fieldsOf(block));
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDrag(String(active.id));
  }

  function handleDragOver({ over }: DragOverEvent) {
    setOverId(over ? String(over.id) : null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDrag(null);
    setOverId(null);
    if (!over) return;
    const activeId = String(active.id);
    const targetId = String(over.id);

    if (activeId.startsWith(PALETTE_PREFIX)) {
      const type = activeId.slice(PALETTE_PREFIX.length) as ContentBlockType;
      const index = targetId === CANVAS_END ? blocks.length : blocks.findIndex((b) => b.id === targetId);
      void createBlock(type, index === -1 ? blocks.length : index);
      return;
    }
    if (activeId === targetId || targetId === CANVAS_END) return;
    move(
      blocks.findIndex((b) => b.id === activeId),
      blocks.findIndex((b) => b.id === targetId)
    );
  }

  function dragLabel(id: string) {
    if (id.startsWith(PALETTE_PREFIX)) return `a new ${BLOCK_DEFINITION_BY_TYPE[id.slice(PALETTE_PREFIX.length) as ContentBlockType].label} block`;
    if (id === CANVAS_END) return "the end of the lesson";
    const index = blocks.findIndex((b) => b.id === id);
    return index === -1 ? "block" : `${BLOCK_DEFINITION_BY_TYPE[blocks[index]!.type].label} block ${index + 1}`;
  }

  const draggingFromPalette = activeDrag?.startsWith(PALETTE_PREFIX) ?? false;
  const paletteDefinition = draggingFromPalette
    ? BLOCK_DEFINITION_BY_TYPE[activeDrag!.slice(PALETTE_PREFIX.length) as ContentBlockType]
    : null;

  return (
    <BuilderConfigContext.Provider value={{ r2PublicBaseUrl, studyKind }}>
      <DndContext
        id={contextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveDrag(null);
          setOverId(null);
        }}
        accessibility={{ announcements: dragAnnouncements(dragLabel) }}
      >
        <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8 space-y-6 lg:space-y-0">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <BlockPalette onAdd={(type) => void createBlock(type, blocks.length)} disabled={busy} />
          </aside>

          <section aria-label="Lesson content" className="min-w-0">
            {studyKind === "devotional" && (
              <p className="mb-3 text-sm text-moss max-w-prose">
                Readers see this lesson&apos;s first Text block as the day itself (title, key verse, Lift Up Your Eyes,
                A Question to Sit With -- use <span className="text-ink">Insert section</span> to add those parts), and
                any other blocks after it, in this order.
              </p>
            )}
            {error && (
              <p role="alert" className="mb-3 text-sm text-error bg-error/10 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                {error}
                <button type="button" className="underline text-ink" onClick={() => router.refresh()}>
                  Reload
                </button>
              </p>
            )}

            {blocks.length > 0 && (
              <div className="flex justify-end gap-3 mb-2 text-xs">
                <button type="button" className="text-moss underline" onClick={() => setExpanded(new Set(blocks.map((b) => b.id)))}>
                  Expand all
                </button>
                <button type="button" className="text-moss underline" onClick={() => setExpanded(new Set())}>
                  Collapse all
                </button>
              </div>
            )}

            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div>
                {blocks.map((block, index) => (
                  <div key={block.id}>
                    <InsertHere index={index} disabled={busy} onInsert={(type, i) => void createBlock(type, i)} />
                    {draggingFromPalette && overId === block.id && (
                      <div className="h-1 rounded bg-ember-700 mb-2" aria-hidden="true" />
                    )}
                    <SortableRow
                      id={block.id}
                      label={`${BLOCK_DEFINITION_BY_TYPE[block.type].label} block`}
                      index={index}
                      total={blocks.length}
                      onMove={(direction) => {
                        const movedId = move(index, direction === "up" ? index - 1 : index + 1);
                        if (movedId) focusDragHandle(movedId);
                      }}
                    >
                      <BlockItem
                        block={block}
                        expanded={expanded.has(block.id)}
                        onToggle={() =>
                          setExpanded((s) => {
                            const next = new Set(s);
                            if (next.has(block.id)) next.delete(block.id);
                            else next.add(block.id);
                            return next;
                          })
                        }
                        onLocalChange={(patch) =>
                          setBlocks((current) => current.map((b) => (b.id === block.id ? { ...b, ...patch } : b)))
                        }
                        onDuplicate={() => void createBlock(block.type, index + 1, fieldsOf(block))}
                        onRemove={() => void remove(index)}
                      />
                    </SortableRow>
                  </div>
                ))}
              </div>
            </SortableContext>

            {blocks.length === 0 ? (
              <div className="border-2 border-dashed border-moss/30 rounded-lg p-8 text-center text-moss">
                <p className="font-medium text-ink">This lesson is empty.</p>
                <p className="text-sm mt-1">Pick a block from the palette, or drag one here, to start building.</p>
              </div>
            ) : (
              <InsertHere index={blocks.length} disabled={busy} onInsert={(type, i) => void createBlock(type, i)} />
            )}
            <CanvasEnd active={draggingFromPalette} />

            <div role="status" aria-live="polite">
              {removed && (
                <p className="mt-3 flex items-center gap-3 text-sm text-moss bg-moss/5 rounded-lg px-3 py-2">
                  Removed the {BLOCK_DEFINITION_BY_TYPE[removed.block.type].label.toLowerCase()} block.
                  <button type="button" onClick={() => void undoRemove()} className="font-medium text-ink underline">
                    Undo
                  </button>
                </p>
              )}
            </div>
            {announcer}
          </section>
        </div>

        <DragOverlay dropAnimation={null}>
          {paletteDefinition && (
            <div className="flex items-center gap-3 rounded-lg border border-ink/30 bg-white px-3 py-2 shadow-lg">
              <BlockIcon name={paletteDefinition.icon} className="text-ember-700" />
              <span className="text-sm font-medium">{paletteDefinition.label}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </BuilderConfigContext.Provider>
  );
}
