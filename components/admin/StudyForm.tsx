"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type StudyFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  coverImageAlt: string;
  productId: string;
  published: boolean;
};

export function StudyForm({
  initial,
  digitalProducts,
}: {
  initial?: Partial<StudyFormValues>;
  digitalProducts: { id: string; title: string }[];
}) {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const descId = useId();
  const productId_ = useId();
  const altId = useId();
  const [values, setValues] = useState<StudyFormValues>({
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    coverImageUrl: initial?.coverImageUrl ?? null,
    coverImageAlt: initial?.coverImageAlt ?? "",
    productId: initial?.productId ?? digitalProducts[0]?.id ?? "",
    published: initial?.published ?? false,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const altTextMissing = !!values.coverImageUrl && values.coverImageAlt.trim().length === 0;

  async function uploadCover(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const key = `studies/${crypto.randomUUID()}.${ext}`;
    const res = await fetch("/api/admin/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, contentType: file.type }),
    });
    const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    setValues((v) => ({ ...v, coverImageUrl: publicUrl }));
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (altTextMissing) return;
    setSaving(true);
    setError(null);

    const method = initial?.id ? "PATCH" : "POST";
    const body = initial?.id ? { ...values, id: initial.id } : values;

    // Guards against both a validation failure (res.ok false, a real error
    // body to show) and a genuinely broken response (network failure, or a
    // server crash returning an empty/non-JSON body, where res.json() itself
    // throws) -- either way this always surfaces an error and always resets
    // saving, instead of leaving the button on "Saving..." forever with no
    // feedback (the exact bug the unguarded version of this had).
    try {
      const res = await fetch("/api/admin/studies", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; message?: string; error?: string };

      if (!res.ok || !data.id) {
        setError(data.message ?? data.error ?? "Couldn't save this study.");
        setSaving(false);
        return;
      }

      router.push(`/admin/studies/${data.id}`);
      router.refresh();
    } catch {
      setError("Save failed — the server didn't respond as expected. Please try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (
      !window.confirm(
        `Delete "${values.title || "this study"}"? This deletes all of its lessons and content, and can't be undone.`
      )
    )
      return;
    setDeleting(true);
    setError(null);

    const res = await fetch("/api/admin/studies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: initial.id }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({ message: "Delete failed" }))) as { message?: unknown };
      setError(typeof data.message === "string" ? data.message : "Couldn't delete this study.");
      setDeleting(false);
      return;
    }

    router.push("/admin/studies");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Study details">
      <div>
        <label htmlFor={titleId} className="block text-sm font-medium mb-1">Title</label>
        <input
          id={titleId}
          required
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={slugId} className="block text-sm font-medium mb-1">Slug (URL path)</label>
        <input
          id={slugId}
          required
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={values.slug}
          onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={descId} className="block text-sm font-medium mb-1">Description</label>
        <textarea
          id={descId}
          rows={3}
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={productId_} className="block text-sm font-medium mb-1">Linked product (gates access)</label>
        <select
          id={productId_}
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={values.productId}
          onChange={(e) => setValues((v) => ({ ...v, productId: e.target.value }))}
        >
          {digitalProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <p className="text-xs text-moss mt-1">
          Only digital products appear here — purchasing this product grants entitlement to this study.
        </p>
      </div>

      <div>
        <span className="block text-sm font-medium mb-1" id="cover-image-label">Cover image</span>
        {values.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={values.coverImageUrl}
            alt={values.coverImageAlt || "Untitled cover image — add alt text below"}
            className="w-32 h-32 object-cover rounded mb-2"
          />
        )}
        <input
          type="file"
          accept="image/*"
          aria-labelledby="cover-image-label"
          onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
        />
        <p role="status" aria-live="polite" className="text-sm text-moss h-5">
          {uploading ? "Uploading..." : ""}
        </p>

        {values.coverImageUrl && (
          <div className="mt-2">
            <label htmlFor={altId} className="block text-sm font-medium mb-1">
              Alt text <span aria-hidden="true" className="text-error">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id={altId}
              required
              aria-invalid={altTextMissing}
              aria-describedby={altTextMissing ? `${altId}-error` : undefined}
              className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
              placeholder="Describe the cover image for screen reader users"
              value={values.coverImageAlt}
              onChange={(e) => setValues((v) => ({ ...v, coverImageAlt: e.target.value }))}
            />
            {altTextMissing && (
              <p id={`${altId}-error`} className="text-sm text-error mt-1">
                Alt text is required whenever an image is attached (WCAG 1.1.1).
              </p>
            )}
          </div>
        )}
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={values.published}
          onChange={(e) => setValues((v) => ({ ...v, published: e.target.checked }))}
        />
        <span className="text-sm">Published</span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || deleting || uploading || altTextMissing}>
          {saving ? "Saving..." : "Save study"}
        </Button>

        {initial?.id && (
          <Button type="button" variant="danger" onClick={handleDelete} disabled={saving || deleting}>
            {deleting ? "Deleting..." : "Delete study"}
          </Button>
        )}
      </div>
    </form>
  );
}
