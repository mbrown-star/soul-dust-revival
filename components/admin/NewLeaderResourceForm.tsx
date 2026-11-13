"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Starts a leader resource from its title, then opens it to add the body
 * and a PDF. Replaces a "+ Add resource" button that asked for the title in
 * a browser prompt (staging audit, 2026-11-13), so this section adds things
 * the way the others do: a "+ New …" link to its own page.
 */
export function NewLeaderResourceForm() {
  const router = useRouter();
  const titleId = useId();
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leader-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) throw new Error();
      const resource = (await res.json()) as { id: string };
      router.push(`/admin/leader-resources/${resource.id}`);
      router.refresh();
    } catch {
      setError("Couldn't create the resource. Please try again.");
      setCreating(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor={titleId} className="block text-sm font-medium mb-1">
          Title
        </label>
        <input
          id={titleId}
          required
          maxLength={200}
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={creating || !title.trim()}>
        {creating ? "Creating..." : "Create resource"}
      </Button>
    </form>
  );
}
