"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FacebookPagePickerForm({ pages }: { pages: { id: string; name: string }[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(pages[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/connections/facebook/select-page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId: selected }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { message?: string };
      setError(data.message ?? "Couldn't connect that Page.");
      setSaving(false);
      return;
    }

    router.push("/admin/settings/connections?connected=facebook");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <fieldset className="space-y-2">
        <legend className="sr-only">Facebook Page</legend>
        {pages.map((page) => (
          <label key={page.id} className="flex items-center gap-2 border rounded-lg p-3 cursor-pointer">
            <input
              type="radio"
              name="page"
              value={page.id}
              checked={selected === page.id}
              onChange={() => setSelected(page.id)}
            />
            <span>{page.name}</span>
          </label>
        ))}
      </fieldset>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving || !selected}
        className="bg-neutral-900 text-white rounded-lg px-6 py-3 disabled:opacity-50"
      >
        {saving ? "Connecting..." : "Connect this Page"}
      </button>
    </form>
  );
}
