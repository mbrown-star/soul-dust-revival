"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ImportStudyForm({
  digitalProducts,
}: {
  digitalProducts: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [productId, setProductId] = useState(digitalProducts[0]?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(f: File) {
    setFile(f);
    if (!title) {
      const nameWithoutExt = f.name.replace(/\.(docx|pdf)$/i, "");
      setTitle(nameWithoutExt);
      setSlug(nameWithoutExt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setImporting(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("slug", slug);
    formData.append("productId", productId);

    const res = await fetch("/api/admin/studies/import", { method: "POST", body: formData });
    const data = (await res.json()) as { studyId: string; error?: string };

    if (!res.ok) {
      setError(data.error ?? "Import failed.");
      setImporting(false);
      return;
    }

    router.push(`/admin/studies/${data.studyId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleImport} className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-medium mb-1">Document (.docx or .pdf)</label>
        <input
          type="file"
          accept=".docx,.pdf"
          required
          onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
        />
        <p className="text-xs text-moss mt-1">
          .docx files split into lessons using the document&apos;s own heading styles (most reliable).
          .pdf files split using a &quot;Week 1 / Lesson 2 / Session 3&quot; heuristic — review the result
          afterward, since PDF text has no formatting to rely on.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Study title</label>
        <input
          required
          className="w-full border rounded-lg p-3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Slug</label>
        <input
          required
          className="w-full border rounded-lg p-3"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Linked product (gates access)</label>
        <select
          className="w-full border rounded-lg p-3"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          {digitalProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-error text-sm">{error}</p>}

      <button
        type="submit"
        disabled={importing || !file}
        className="bg-ink text-white rounded-lg px-6 py-3 disabled:opacity-50"
      >
        {importing ? "Importing..." : "Import document"}
      </button>

      <p className="text-xs text-moss">
        The study is created as a draft (unpublished) so you can review and edit the
        auto-generated lessons before making it available.
      </p>
    </form>
  );
}
