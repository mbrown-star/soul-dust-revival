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
  backImageUrl: string | null;
  backImageAlt: string;
  coverPdfUrl: string | null;
  amazonUrl: string | null;
  sellOnStripe: boolean;
  active: boolean;
  featured: boolean;
};

export function ProductForm({ initial }: { initial?: Partial<ProductFormValues> }) {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const descId = useId();
  const priceId = useId();
  const formatId = useId();
  const altId = useId();
  const backAltId = useId();
  const amazonUrlId = useId();
  const [values, setValues] = useState<ProductFormValues>({
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    priceCents: initial?.priceCents ?? 0,
    format: initial?.format ?? "digital",
    type: initial?.type ?? "book",
    imageUrl: initial?.imageUrl ?? null,
    imageAlt: initial?.imageAlt ?? "",
    backImageUrl: initial?.backImageUrl ?? null,
    backImageAlt: initial?.backImageAlt ?? "",
    coverPdfUrl: initial?.coverPdfUrl ?? null,
    amazonUrl: initial?.amazonUrl ?? null,
    sellOnStripe: initial?.sellOnStripe ?? true,
    active: initial?.active ?? true,
    featured: initial?.featured ?? false,
  });
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isBook = values.type === "book";
  // Book cover alt text (front and back) is optional -- only a non-book
  // product image still requires it.
  const altTextMissing = !isBook && !!values.imageUrl && values.imageAlt.trim().length === 0;
  const isPhysical = values.format === "physical";
  const noPurchaseRoute = !values.sellOnStripe && !values.amazonUrl;

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

  async function handleCoverPdfUpload(file: File) {
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.set("file", file);

    const res = await fetch("/api/admin/products/cover-pdf", { method: "POST", body: formData });

    if (!res.ok) {
      const { message } = await res.json().catch(() => ({ message: null }));
      setUploadError(message || "Couldn't process that cover PDF. Please try a different file.");
      setUploading(false);
      return;
    }

    const { coverPdfUrl, backImageUrl, frontImageUrl } = await res.json();
    setValues((v) => ({ ...v, coverPdfUrl, backImageUrl, imageUrl: frontImageUrl }));
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (altTextMissing) return; // guard: never save an image with no alt text
    if (noPurchaseRoute) return;
    setSaving(true);

    const method = initial?.id ? "PATCH" : "POST";
    // An enabled-but-empty Amazon URL field submits as "" — normalize to
    // null so it doesn't fail the server's url() validation.
    const payload = { ...values, amazonUrl: values.amazonUrl ? values.amazonUrl : null };
    const body = initial?.id ? { ...payload, id: initial.id } : payload;

    const res = await fetch("/api/admin/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Save failed" }));
      setValidationError(
        typeof data.message === "string" ? data.message : "Couldn't save — check the form for errors."
      );
      setSaving(false);
      return;
    }

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
            onChange={(e) => {
              const format = e.target.value as "physical" | "digital";
              setValues((v) => ({
                ...v,
                format,
                // Amazon isn't a valid route for digital products (no way to
                // grant entitlements off an Amazon sale), and digital must
                // always go through Stripe.
                ...(format === "digital" ? { amazonUrl: null, sellOnStripe: true } : {}),
              }));
            }}
          >
            <option value="physical">Physical (ships)</option>
            <option value="digital">Digital / web app access</option>
          </select>
        </div>
      </div>

      <fieldset className="border rounded-lg p-4">
        <legend className="text-sm font-medium px-1">Purchase options</legend>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.sellOnStripe}
            disabled={!isPhysical}
            onChange={(e) => setValues((v) => ({ ...v, sellOnStripe: e.target.checked }))}
          />
          <span className="text-sm">
            Sell via Stripe (shows a &quot;Buy Now&quot; button){!isPhysical && " — required for digital products"}
          </span>
        </label>

        {isPhysical && (
          <div className="mt-3">
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={values.amazonUrl !== null}
                onChange={(e) => setValues((v) => ({ ...v, amazonUrl: e.target.checked ? "" : null }))}
              />
              <span className="text-sm">Sell via Amazon (shows a &quot;Buy on Amazon&quot; button)</span>
            </label>

            {values.amazonUrl !== null && (
              <div>
                <label htmlFor={amazonUrlId} className="block text-sm font-medium mb-1">
                  Amazon product URL
                </label>
                <input
                  id={amazonUrlId}
                  required
                  type="url"
                  placeholder="https://www.amazon.com/dp/XXXXXXXXXX"
                  className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  value={values.amazonUrl}
                  onChange={(e) => setValues((v) => ({ ...v, amazonUrl: e.target.value }))}
                />
              </div>
            )}
          </div>
        )}

        {noPurchaseRoute && (
          <p className="text-sm text-red-600 mt-2" role="alert">
            Enable at least one purchase route.
          </p>
        )}
      </fieldset>

      {isBook ? (
        <div>
          <span className="block text-sm font-medium mb-1" id="cover-pdf-label">
            Cover PDF (full wrap: back cover + spine + front cover, as exported for KDP print)
          </span>
          <div className="flex gap-3 mb-2">
            {values.backImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.backImageUrl}
                alt={values.backImageAlt || "Back cover preview"}
                className="w-24 h-24 object-cover rounded"
              />
            )}
            {values.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.imageUrl}
                alt={values.imageAlt || "Front cover preview"}
                className="w-24 h-24 object-cover rounded"
              />
            )}
          </div>
          <input
            type="file"
            accept="application/pdf"
            aria-labelledby="cover-pdf-label"
            onChange={(e) => e.target.files?.[0] && handleCoverPdfUpload(e.target.files[0])}
          />
          <p role="status" aria-live="polite" className="text-sm text-neutral-600 h-5">
            {uploading ? "Processing cover PDF..." : ""}
          </p>
          {values.coverPdfUrl && (
            <p className="text-sm">
              <a href={values.coverPdfUrl} target="_blank" rel="noreferrer" className="underline">
                View current cover PDF
              </a>
            </p>
          )}
          {uploadError && (
            <p role="alert" className="text-sm text-red-600 mt-1">
              {uploadError}
            </p>
          )}

          {values.backImageUrl && (
            <div className="mt-2">
              <label htmlFor={backAltId} className="block text-sm font-medium mb-1">
                Back cover alt text <span className="text-neutral-500 font-normal">(optional)</span>
              </label>
              <input
                id={backAltId}
                className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Describe the back cover for screen reader users"
                value={values.backImageAlt}
                onChange={(e) => setValues((v) => ({ ...v, backImageAlt: e.target.value }))}
              />
            </div>
          )}

          {values.imageUrl && (
            <div className="mt-2">
              <label htmlFor={altId} className="block text-sm font-medium mb-1">
                Front cover alt text <span className="text-neutral-500 font-normal">(optional)</span>
              </label>
              <input
                id={altId}
                className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                placeholder="Describe the front cover for screen reader users"
                value={values.imageAlt}
                onChange={(e) => setValues((v) => ({ ...v, imageAlt: e.target.value }))}
              />
            </div>
          )}
        </div>
      ) : (
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
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={values.active}
          onChange={(e) => setValues((v) => ({ ...v, active: e.target.checked }))}
        />
        <span className="text-sm">Active (visible for purchase)</span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={values.featured}
          onChange={(e) => setValues((v) => ({ ...v, featured: e.target.checked }))}
        />
        <span className="text-sm">
          Featured (shown in the homepage&apos;s &quot;Featured content&quot; section — up to 8)
        </span>
      </label>

      {validationError && (
        <p className="text-sm text-red-600" role="alert">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || uploading || altTextMissing || noPurchaseRoute}
        className="bg-neutral-900 text-white rounded-lg px-6 py-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
      >
        {saving ? "Saving..." : "Save product"}
      </button>
    </form>
  );
}
