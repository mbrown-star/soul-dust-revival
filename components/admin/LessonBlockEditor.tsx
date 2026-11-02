"use client";

import { useState } from "react";
import { SortableBlockList } from "./SortableBlockList";
import { AddBlockButton } from "./AddBlockButton";
import { ContentBlockData } from "./BlockEditor";

export function LessonBlockEditor({
  lessonId,
  initialBlocks,
}: {
  lessonId: string;
  initialBlocks: ContentBlockData[];
}) {
  const [blocks, setBlocks] = useState<ContentBlockData[]>(initialBlocks);

  return (
    <div className="space-y-4">
      <SortableBlockList blocks={blocks} setBlocks={setBlocks} />
      <AddBlockButton lessonId={lessonId} onAdd={(block) => setBlocks((b) => [...b, block])} />
    </div>
  );
}
