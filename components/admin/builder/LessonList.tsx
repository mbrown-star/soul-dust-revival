"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/Button";
import { inputClass } from "./fields";
import { useBuilderSensors } from "./SortableList";
import { SortableRow, dragAnnouncements, focusDragHandle, useReorderAnnouncer } from "./SortableRow";

export type LessonListItem = { id: string; title: string; published: boolean; isWeek: boolean };

async function readError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { message?: string };
    return data.message ?? fallback;
  } catch {
    return fallback;
  }
}

/** A study's lessons: drag or Move up/down to reorder, toggle published, add a new one in place. */
export function LessonList({ studyId, initialLessons }: { studyId: string; initialLessons: LessonListItem[] }) {
  const router = useRouter();
  const contextId = useId();
  const newTitleId = useId();
  const [items, setItems] = useState(initialLessons);
  // Take fresh server data after a refresh (e.g. "Publish all") without
  // remounting the list, which would drop keyboard focus. Compared by
  // content: the prop array isn't guaranteed the same object across renders.
  const serverSignature = JSON.stringify(initialLessons);
  const [lastSignature, setLastSignature] = useState(serverSignature);
  if (serverSignature !== lastSignature) {
    setLastSignature(serverSignature);
    setItems(initialLessons);
  }
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { announce, announcer } = useReorderAnnouncer();
  const sensors = useBuilderSensors();

  async function persistOrder(next: LessonListItem[], previous: LessonListItem[]) {
    setItems(next);
    setError(null);
    const res = await fetch("/api/admin/lessons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reorder: next.map((l, i) => ({ id: l.id, orderIndex: i })) }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setItems(previous);
      setError(res ? await readError(res, "Couldn't save the new order.") : "Couldn't save the new order. Check your connection.");
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= items.length || from === to) return;
    const moved = items[from]!;
    void persistOrder(arrayMove(items, from, to), items);
    announce(`Moved ${moved.title} to position ${to + 1} of ${items.length}`);
    return moved.id;
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    move(
      items.findIndex((l) => l.id === active.id),
      items.findIndex((l) => l.id === over.id)
    );
  }

  async function togglePublished(lesson: LessonListItem) {
    const published = !lesson.published;
    setItems((current) => current.map((l) => (l.id === lesson.id ? { ...l, published } : l)));
    const res = await fetch("/api/admin/lessons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lesson.id, title: lesson.title, published }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setItems((current) => current.map((l) => (l.id === lesson.id ? { ...l, published: lesson.published } : l)));
      setError(`Couldn't change whether "${lesson.title}" is published.`);
    } else {
      router.refresh();
    }
  }

  async function deleteLesson(lesson: LessonListItem) {
    if (!window.confirm(`Delete the draft lesson "${lesson.title}" and all of its content? This can't be undone.`)) return;
    setError(null);
    const res = await fetch("/api/admin/lessons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lesson.id }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setError(res ? await readError(res, `Couldn't delete "${lesson.title}".`) : "Couldn't delete the lesson. Check your connection.");
      return;
    }
    // The deleted row's button is gone, so keep keyboard focus nearby: the
    // next lesson's handle, or the new-lesson field if it was the last one.
    const index = items.findIndex((l) => l.id === lesson.id);
    const neighbor = items[index + 1] ?? items[index - 1];
    setItems((current) => current.filter((l) => l.id !== lesson.id));
    announce(`Deleted ${lesson.title}`);
    if (neighbor) focusDragHandle(neighbor.id);
    else requestAnimationFrame(() => document.getElementById(newTitleId)?.focus());
    router.refresh();
  }

  async function createLesson(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyId, title }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setCreating(false);
      setError("Couldn't add the lesson.");
      return;
    }
    const lesson = (await res.json()) as { id: string };
    router.push(`/admin/studies/${studyId}/lessons/${lesson.id}`);
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-error bg-error/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-moss">No lessons yet.</p>
      ) : (
        <DndContext
          id={contextId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements: dragAnnouncements((id) => items.find((l) => l.id === id)?.title ?? "lesson") }}
        >
          <SortableContext items={items.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {items.map((lesson, index) => (
                <li key={lesson.id}>
                  <SortableRow
                    id={lesson.id}
                    label={lesson.title}
                    index={index}
                    total={items.length}
                    compact
                    onMove={(direction) => {
                      const movedId = move(index, direction === "up" ? index - 1 : index + 1);
                      if (movedId) focusDragHandle(movedId);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-3 border border-moss/15 rounded-lg bg-white px-3 py-2">
                      <span className="text-xs text-moss w-6 text-right tabular-nums">{index + 1}</span>
                      <Link
                        href={`/admin/studies/${studyId}/lessons/${lesson.id}`}
                        className="flex-1 min-w-[10rem] text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink rounded"
                      >
                        {lesson.title}
                      </Link>
                      {lesson.isWeek && <span className="text-xs text-ember-700 bg-ember-700/10 rounded-full px-2 py-0.5">Week builder</span>}
                      <label className="flex items-center gap-2 text-sm text-moss">
                        <input type="checkbox" checked={lesson.published} onChange={() => void togglePublished(lesson)} />
                        <span>{lesson.published ? "Published" : "Draft"}</span>
                        <span className="sr-only"> -- {lesson.title}</span>
                      </label>
                      {!lesson.published && (
                        <button
                          type="button"
                          onClick={() => void deleteLesson(lesson)}
                          className="text-sm text-error px-2 min-h-[36px] rounded hover:bg-error/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
                        >
                          Delete<span className="sr-only"> draft lesson {lesson.title}</span>
                        </button>
                      )}
                    </div>
                  </SortableRow>
                </li>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {announcer}

      <form onSubmit={createLesson} className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <label htmlFor={newTitleId} className="block text-xs font-medium text-moss uppercase tracking-wide mb-1">
            New lesson title
          </label>
          <input id={newTitleId} value={newTitle} maxLength={200} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} placeholder="Week 3: …" />
        </div>
        <Button type="submit" disabled={creating || !newTitle.trim()}>
          {creating ? "Adding…" : "+ Add lesson"}
        </Button>
      </form>
    </div>
  );
}
