"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";

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
    const { uploadUrl, publicUrl } = await res.json();
    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    setValues((v) => ({ ...v, coverImageUrl: publicUrl }));
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (altTextMissing) return;
    setSaving(true);

    const method = initial?.id ? "PATCH" : "POST";
    const body = initial?.id ? { ...values, id: initial.id } : values;

    const res = await fetch("/api/admin/studies", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const study = await res.json();

    router.push(`/admin/studies/${study.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg" aria-label="Study details">
      <div>
        <label htmlFor={titleId} className="block text-sm font-medium mb-1">Title</label>
        <input
          id={titleId}
          required
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={slugId} className="block text-sm font-medium mb-1">Slug (URL path)</label>
        <input
          id={slugId}
          required
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          value={values.slug}
          onChange={(e) => setValues((v) => ({ ...v, slug: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={descId} className="block text-sm font-medium mb-1">Description</label>
        <textarea
          id={descId}
          rows={3}
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={productId_} className="block text-sm font-medium mb-1">Linked product (gates access)</label>
        <select
          id={productId_}
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          value={values.productId}
          onChange={(e) => setValues((v) => ({ ...v, productId: e.target.value }))}
        >
          {digitalProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-400 mt-1">
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
        <p role="status" aria-live="polite" className="text-sm text-neutral-500 h-5">
          {uploading ? "Uploading..." : ""}
        </p>

        {values.coverImageUrl && (
          <div className="mt-2">
            <label htmlFor={altId} className="block text-sm font-medium mb-1">
              Alt text <span aria-hidden="true" className="text-red-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id={altId}
              required
              aria-invalid={altTextMissing}
              aria-describedby={altTextMissing ? `${altId}-error` : undefined}
              className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              placeholder="Describe the cover image for screen reader users"
              value={values.coverImageAlt}
              onChange={(e) => setValues((v) => ({ ...v, coverImageAlt: e.target.value }))}
            />
            {altTextMissing && (
              <p id={`${altId}-error`} className="text-sm text-red-600 mt-1">
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

      <button
        type="submit"
        disabled={saving || uploading || altTextMissing}
        className="bg-neutral-900 text-white rounded-lg px-6 py-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
      >
        {saving ? "Saving..." : "Save study"}
      </button>
    </form>
  );
}
