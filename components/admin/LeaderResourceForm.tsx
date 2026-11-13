"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { RichTextEditor } from "./RichTextEditor";
import { UploadError, uploadFileToR2 } from "@/lib/r2/browserUpload";
import { RESOURCE_PDF_UPLOAD_MAX_BYTES } from "@/lib/uploads/limits";
import { useSavedIndicator } from "@/lib/hooks/useSavedIndicator";

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
  const { saved, markSaved } = useSavedIndicator();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Saves as you go (a field on blur, the body as you type); Save sends
  // everything at once, like the other admin forms' Save buttons.
  async function save(patch: Partial<ResourceFormValues>): Promise<boolean> {
    const updated = { ...values, ...patch };
    setValues(updated);
    setError(null);
    try {
      const res = await fetch("/api/admin/leader-resources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: values.id, ...patch }),
      });
      if (!res.ok) throw new Error();
      markSaved();
      return true;
    } catch {
      setError("Couldn't save. Please try again.");
      return false;
    }
  }

  async function handleSave() {
    setSaving(true);
    await save({ title: values.title, body: values.body, published: values.published });
    setSaving(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${values.title || "this resource"}"? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/admin/leader-resources", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: values.id }),
    }).catch(() => null);
    if (!res?.ok) {
      setError("Couldn't delete this resource. Please try again.");
      setDeleting(false);
      return;
    }
    router.push("/admin/leader-resources");
    router.refresh();
  }

  async function uploadFile(file: File) {
    if (file.type !== "application/pdf") {
      window.alert("Only PDF files are supported for leader resource downloads.");
      return;
    }
    setUploading(true);
    try {
      const publicUrl = await uploadFileToR2({
        endpoint: "/api/admin/leader-file-upload-url",
        request: {},
        file,
        contentType: "application/pdf",
        maxBytes: RESOURCE_PDF_UPLOAD_MAX_BYTES,
      });
      await save({ fileUrl: publicUrl, fileName: file.name });
    } catch (err) {
      window.alert(err instanceof UploadError ? err.message : "Couldn't upload that PDF. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
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
        {values.fileName && <p className="text-sm text-moss mb-2">📄 {values.fileName}</p>}
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <p role="status" aria-live="polite" className="text-sm text-moss h-5">
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

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saving || deleting || !values.title.trim()}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="danger" onClick={handleDelete} disabled={saving || deleting}>
          {deleting ? "Deleting..." : "Delete resource"}
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-moss">
          {saved ? "Saved" : ""}
        </p>
      </div>
    </div>
  );
}
