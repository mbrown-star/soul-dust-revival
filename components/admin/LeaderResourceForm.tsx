"use client";

import { useState } from "react";
import { RichTextEditor } from "./RichTextEditor";

type ResourceFormValues = {
  id: string;
  title: string;
  body: string;
  fileUrl: string | null;
  fileName: string | null;
  published: boolean;
};

export function LeaderResourceForm({ initial }: { initial: ResourceFormValues }) {
  const [values, setValues] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(patch: Partial<ResourceFormValues>) {
    const updated = { ...values, ...patch };
    setValues(updated);
    await fetch("/api/admin/leader-resources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: values.id, ...patch }),
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  async function uploadFile(file: File) {
    if (file.type !== "application/pdf") {
      window.alert("Only PDF files are supported for leader resource downloads.");
      return;
    }
    setUploading(true);
    const key = `leader-resources/${crypto.randomUUID()}.pdf`;
    const res = await fetch("/api/admin/leader-file-upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, contentType: "application/pdf" }),
    });
    const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
    await save({ fileUrl: publicUrl, fileName: file.name });
    setUploading(false);
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <label className="block text-sm font-medium mb-1">Title</label>
        <input
          className="w-full border rounded-lg p-3"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          onBlur={() => save({ title: values.title })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Body</label>
        <RichTextEditor content={values.body} onChange={(html) => save({ body: html })} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Attached PDF (optional)</label>
        {values.fileName && <p className="text-sm text-neutral-600 mb-2">📄 {values.fileName}</p>}
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <p role="status" aria-live="polite" className="text-sm text-neutral-600 h-5">
          {uploading ? "Uploading..." : ""}
        </p>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={values.published}
          onChange={(e) => save({ published: e.target.checked })}
        />
        <span className="text-sm">Published (visible to leaders)</span>
      </label>

      <p role="status" aria-live="polite" className="text-sm text-neutral-600 h-5">
        {saved ? "Saved" : ""}
      </p>
    </div>
  );
}
