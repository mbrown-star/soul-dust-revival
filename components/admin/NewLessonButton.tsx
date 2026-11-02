"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewLessonButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function createLesson() {
    setCreating(true);
    const title = window.prompt("Lesson title");
    if (!title) {
      setCreating(false);
      return;
    }

    const res = await fetch("/api/admin/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studyId, title }),
    });
    const lesson = await res.json();

    router.push(`/admin/studies/${studyId}/lessons/${lesson.id}`);
    router.refresh();
  }

  return (
    <button
      onClick={createLesson}
      disabled={creating}
      className="bg-neutral-900 text-white rounded-lg px-4 py-2 disabled:opacity-50"
    >
      + Add lesson
    </button>
  );
}
