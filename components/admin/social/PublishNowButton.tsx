"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Publish now" for one platform of a post on the Social list: sends it
 * immediately instead of waiting for its scheduled run.
 */
export function PublishNowButton({ targetId, platformLabel }: { targetId: string; platformLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (!window.confirm(`Publish this post to ${platformLabel} right now?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/social/targets/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetIds: [targetId] }),
      });
      const data = (await res.json().catch(() => ({}))) as { results?: { ok: boolean; error?: string }[] };
      const result = data.results?.[0];
      if (!res.ok || !result) setError("Couldn't start publishing. Please try again.");
      else if (!result.ok) setError(result.error ?? "Publishing failed.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={publish}
        disabled={busy}
        aria-label={`Publish now to ${platformLabel}`}
        className="text-xs underline text-ink disabled:opacity-50"
      >
        {busy ? "Publishing..." : "Publish now"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      )}
    </span>
  );
}
