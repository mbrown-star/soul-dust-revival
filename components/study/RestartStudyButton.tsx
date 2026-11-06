"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RestartStudyButton({ studyId, studyTitle }: { studyId: string; studyTitle: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  async function handleRestart() {
    if (!window.confirm(`Start "${studyTitle}" over? Your progress resets to the beginning — your saved answers stay.`))
      return;
    setWorking(true);
    try {
      await fetch("/api/progress/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studyId }),
      });
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRestart}
      disabled={working}
      className="text-sm text-moss hover:text-ink underline underline-offset-2 disabled:opacity-50"
    >
      {working ? "Starting over..." : "Start over"}
    </button>
  );
}
