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
  const [kind, setKind] = useState<"devotional" | "study">("devotional");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(f: File) {
    setFile(f);
    if (!title) {
      const nameWithoutExt = f.name.replace(/\.(docx|pdf)$/i, "");
      // Filenames commonly use underscores (or dashes) in place of spaces
      // between words -- the suggested title should read as a title, not a
      // filename.
      const suggestedTitle = nameWithoutExt.replace(/[_-]+/g, " ").trim();
      setTitle(suggestedTitle);
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
    formData.append("kind", kind);

    // A server-side crash (e.g. an unhandled exception during parsing) can
    // return an empty or non-JSON body -- res.json() throws in that case,
    // and an uncaught throw here left the button stuck on "Importing..."
    // forever with no error shown, since setImporting(false) was never
    // reached. Wrapping the whole request in try/catch guarantees an error
    // always surfaces and the button always re-enables.
    let data: { studyId?: string; error?: string };
    try {
      const res = await fetch("/api/admin/studies/import", { method: "POST", body: formData });
      data = (await res.json()) as { studyId?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Import failed.");
        setImporting(false);
        return;
      }
    } catch {
      setError("Import failed — the server didn't respond as expected. Please try again.");
      setImporting(false);
      return;
    }

    if (!data.studyId) {
      setError("Import failed — no study was created. Please try again.");
      setImporting(false);
      return;
    }

    router.push(`/admin/studies/${data.studyId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleImport} className="space-y-5">
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

      <fieldset>
        <legend className="block text-sm font-medium mb-1">Kind</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="import-kind"
              checked={kind === "devotional"}
              onChange={() => setKind("devotional")}
            />
            <span className="text-sm">Devotional</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="import-kind"
              checked={kind === "study"}
              onChange={() => setKind("study")}
            />
            <span className="text-sm">Study</span>
          </label>
        </div>
        <p className="text-xs text-moss mt-1">
          For a .pdf, this changes how the document is split: a Study&apos;s own &quot;QUESTION&quot;
          and &quot;Going Deeper&quot; sections become saved-answer and word-study blocks instead of
          plain reading text.
        </p>
      </fieldset>

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

      {/* There's no real percent-complete to report here -- the wait is
          almost entirely server-side document parsing, not upload time --
          so this is a sliding indeterminate bar, not a literal progress
          value. The status text is what actually tells a screen reader
          user (and anyone watching) that something is happening and
          roughly how long to expect, since the disabled button's label
          change alone isn't enough signal that the page hasn't stalled. */}
      {importing && (
        <div className="space-y-2">
          <div className="w-full h-1.5 bg-moss/10 rounded-full overflow-hidden" aria-hidden="true">
            <div className="h-full w-1/3 bg-ink rounded-full indeterminate-bar" />
          </div>
          <p role="status" aria-live="polite" className="text-sm text-moss">
            Parsing your document and creating lessons — this can take a minute or two for
            longer files. Don&apos;t close this page.
          </p>
        </div>
      )}

      <p className="text-xs text-moss">
        The study is created as a draft (unpublished) so you can review and edit the
        auto-generated lessons before making it available.
      </p>
    </form>
  );
}
