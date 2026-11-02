"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewLeaderResourceButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    const title = window.prompt("Resource title");
    if (!title) {
      setCreating(false);
      return;
    }

    const res = await fetch("/api/admin/leader-resources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const resource = await res.json();

    router.push(`/admin/leader-resources/${resource.id}`);
    router.refresh();
  }

  return (
    <button
      onClick={create}
      disabled={creating}
      className="inline-block bg-neutral-900 text-white rounded-lg px-4 py-2 disabled:opacity-50"
    >
      + Add resource
    </button>
  );
}
