"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";

type ProductFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  priceCents: number;
  format: "physical" | "digital";
  type: string;
  imageUrl: string | null;
  imageAlt: string;
  active: boolean;
};

export function ProductForm({ initial }: { initial?: Partial<ProductFormValues> }) {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const descId = useId();
  const priceId = useId();
  const formatId = useId();
  const altId = useId();
  const [values, setValues] = useState<ProductFormValues>({
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    priceCents: initial?.priceCents ?? 0,
    format: initial?.format ?? "digital",
    type: initial?.type ?? "book",
    imageUrl: initial?.imageUrl ?? null,
    imageAlt: initial?.imageAlt ?? "",
    active: initial?.active ?? true,
  });
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const altTextMissing = !!values.imageUrl && values.imageAlt.trim().length === 0;

  function handleTitleChange(title: string) {
    setValues((v) => ({
      ...v,
      title,
      // Auto-generate the slug from the title until the admin edits it
      // directly — same pattern used for study imports, so behavior is
      // consistent across the admin UI.
      slug: slugTouched ? v.slug : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    }));
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const key = `products/${crypto.randomUUID()}.${ext}`;

    const res = await fetch("/api/admin/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, contentType: file.type }),
    });
    const { uploadUrl, publicUrl } = await res.json();

    await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });

    setValues((v) => ({ ...v, imageUrl: publicUrl }));
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (altTextMissing) return; // guard: never save an image with no alt text
    setSaving(true);

    const method = initial?.id ? "PATCH" : "POST";
    const body = initial?.id ? { ...values, id: initial.id } : values;

    await fetch("/api/admin/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    router.push("/admin/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg" aria-label="Product details">
      <div>
        <label htmlFor={titleId} className="block text-sm font-medium mb-1">Title</label>
        <input
          id={titleId}
          required
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          value={values.title}
          onChange={(e) => handleTitleChange(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={slugId} className="block text-sm font-medium mb-1">
          Slug (URL path — used for the public /books/[slug] page)
        </label>
        <input
          id={slugId}
          required
          pattern="[a-z0-9-]+"
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          value={values.slug}
          onChange={(e) => {
            setSlugTouched(true);
            setValues((v) => ({ ...v, slug: e.target.value }));
          }}
        />
      </div>

      <div>
        <label htmlFor={descId} className="block text-sm font-medium mb-1">Description</label>
        <textarea
          id={descId}
          rows={4}
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor={priceId} className="block text-sm font-medium mb-1">Price (USD)</label>
          <input
            id={priceId}
            required
            type="number"
            step="0.01"
            className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            value={(values.priceCents / 100).toFixed(2)}
            onChange={(e) =>
              setValues((v) => ({ ...v, priceCents: Math.round(parseFloat(e.target.value) * 100) }))
            }
          />
        </div>

        <div className="flex-1">
          <label htmlFor={formatId} className="block text-sm font-medium mb-1">Format</label>
          <select
            id={formatId}
            className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
            value={values.format}
            onChange={(e) => setValues((v) => ({ ...v, format: e.target.value as "physical" | "digital" }))}
          >
            <option value="physical">Physical (ships)</option>
            <option value="digital">Digital / web app access</option>
          </select>
        </div>
      </div>

      <div>
        <span className="block text-sm font-medium mb-1" id="product-image-label">Product image</span>
        {values.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={values.imageUrl}
            alt={values.imageAlt || "Untitled product image — add alt text below"}
            className="w-24 h-24 object-cover rounded mb-2"
          />
        )}
        <input
          type="file"
          accept="image/*"
          aria-labelledby="product-image-label"
          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
        />
        <p role="status" aria-live="polite" className="text-sm text-neutral-600 h-5">
          {uploading ? "Uploading..." : ""}
        </p>

        {values.imageUrl && (
          <div className="mt-2">
            <label htmlFor={altId} className="block text-sm font-medium mb-1">
              Alt text <span aria-hidden="true" className="text-red-600">*</span>
              <span className="sr-only"> (required)</span>
            </label>
            <input
              id={altId}
              required
              aria-describedby={altTextMissing ? `${altId}-error` : undefined}
              aria-invalid={altTextMissing}
              className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
              placeholder="Describe the image for screen reader users"
              value={values.imageAlt}
              onChange={(e) => setValues((v) => ({ ...v, imageAlt: e.target.value }))}
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
          checked={values.active}
          onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
        />
        <span className="text-sm">Active (visible for purchase)</span>
      </label>

      <button
        type="submit"
        disabled={saving || uploading || altTextMissing}
        className="bg-neutral-900 text-white rounded-lg px-6 py-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
      >
        {saving ? "Saving..." : "Save product"}
      </button>
    </form>
  );
}
