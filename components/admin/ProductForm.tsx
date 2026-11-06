"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";

type ProductFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  priceCents: number;
  digitalPriceCents: number | null;
  format: "physical" | "digital" | "both";
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
  const digitalPriceId = useId();
  const formatId = useId();
  const altId = useId();
  const backAltId = useId();
  const amazonUrlId = useId();
  const [values, setValues] = useState<ProductFormValues>({
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    priceCents: initial?.priceCents ?? 0,
    digitalPriceCents: initial?.digitalPriceCents ?? null,
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
  const [deleting, setDeleting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isBook = values.type === "book";
  // "Both" sells the physical and digital versions of the same title as two
  // independent purchases — Book Purchase Options cover the physical side
  // (same fields as a plain "physical" product), Digital Purchase Options
  // cover the digital side (always Stripe-only, its own price).
  const showBookOptions = values.format === "physical" || values.format === "both";
  const showDigitalOptions = values.format === "digital" || values.format === "both";
  const noPurchaseRoute = showBookOptions && !values.sellOnStripe && !values.amazonUrl;

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
    const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };

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
      const { message } = (await res.json().catch(() => ({ message: null }))) as { message: string | null };
      setUploadError(message || "Couldn't process that cover PDF. Please try a different file.");
      setUploading(false);
      return;
    }

    const { coverPdfUrl, backImageUrl, frontImageUrl } = (await res.json()) as {
      coverPdfUrl: string;
      backImageUrl: string;
      frontImageUrl: string;
    };
    setValues((v) => ({ ...v, coverPdfUrl, backImageUrl, imageUrl: frontImageUrl }));
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (noPurchaseRoute) return;
    setSaving(true);

    const method = initial?.id ? "PATCH" : "POST";
    // An enabled-but-empty Amazon URL field submits as "" — normalize to
    // null so it doesn't fail the server's url() validation.
    const payload = {
      ...values,
      amazonUrl: showBookOptions && values.amazonUrl ? values.amazonUrl : null,
      digitalPriceCents: values.format === "both" ? values.digitalPriceCents : null,
    };
    const body = initial?.id ? { ...payload, id: initial.id } : payload;

    const res = await fetch("/api/admin/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({ message: "Save failed" }))) as { message?: unknown };
      setValidationError(
        typeof data.message === "string" ? data.message : "Couldn't save — check the form for errors."
      );
      setSaving(false);
      return;
    }

    router.push("/admin/products");
    router.refresh();
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (!window.confirm(`Delete "${values.title}"? This can't be undone.`)) return;
    setDeleting(true);
    setValidationError(null);

    const res = await fetch("/api/admin/products", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: initial.id }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({ message: "Delete failed" }))) as { message?: unknown };
      setValidationError(typeof data.message === "string" ? data.message : "Couldn't delete this product.");
      setDeleting(false);
      return;
    }

    router.push("/admin/products");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Product details">
      <div>
        <label htmlFor={titleId} className="block text-sm font-medium mb-1">Title</label>
        <input
          id={titleId}
          required
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
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
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
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
          className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={formatId} className="block text-sm font-medium mb-1">Format</label>
        <select
          id={formatId}
          className="w-full sm:w-64 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={values.format}
          onChange={(e) => {
            const format = e.target.value as "physical" | "digital" | "both";
            setValues((v) => ({
              ...v,
              format,
              // Amazon isn't a valid route for a purely digital product (no
              // way to grant entitlements off an Amazon sale), and digital
              // must always go through Stripe.
              ...(format === "digital" ? { amazonUrl: null, sellOnStripe: true } : {}),
              // The digital price field displays a $0.00 fallback for a null
              // value (see its own input below), so default the real state
              // to 0 here too the moment "both" is selected -- otherwise an
              // admin who never touches an already-"$0.00"-looking field
              // submits digitalPriceCents: null and hits a confusing
              // "check the form for errors" with no visible cause.
              ...(format === "both" && v.digitalPriceCents == null ? { digitalPriceCents: 0 } : {}),
            }));
          }}
        >
          <option value="physical">Physical (ships)</option>
          <option value="digital">Digital / web app access</option>
          <option value="both">Both — sold as two separate purchases</option>
        </select>
      </div>

      {showBookOptions && (
        <fieldset className="border rounded-lg p-4">
          <legend className="text-sm font-medium px-1">Book Purchase Options</legend>

          <div className="mb-3">
            <label htmlFor={priceId} className="block text-sm font-medium mb-1">
              {values.format === "both" ? "Physical price (USD)" : "Price (USD)"}
            </label>
            <input
              id={priceId}
              required
              type="number"
              step="0.01"
              className="w-full sm:w-48 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
              value={(values.priceCents / 100).toFixed(2)}
              onChange={(e) =>
                setValues((v) => ({ ...v, priceCents: Math.round(parseFloat(e.target.value) * 100) }))
              }
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.sellOnStripe}
              onChange={(e) => setValues((v) => ({ ...v, sellOnStripe: e.target.checked }))}
            />
            <span className="text-sm">Sell via Stripe (shows a &quot;Buy Now&quot; button)</span>
          </label>

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
                  className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
                  value={values.amazonUrl}
                  onChange={(e) => setValues((v) => ({ ...v, amazonUrl: e.target.value }))}
                />
              </div>
            )}
          </div>

          {noPurchaseRoute && (
            <p className="text-sm text-error mt-2" role="alert">
              Enable at least one purchase route.
            </p>
          )}
        </fieldset>
      )}

      {showDigitalOptions && (
        <fieldset className="border rounded-lg p-4">
          <legend className="text-sm font-medium px-1">Digital Purchase Options</legend>

          <div>
            <label htmlFor={digitalPriceId} className="block text-sm font-medium mb-1">
              {values.format === "both" ? "Digital price (USD)" : "Price (USD)"}
            </label>
            <input
              id={digitalPriceId}
              required
              type="number"
              step="0.01"
              className="w-full sm:w-48 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
              value={((values.format === "both" ? values.digitalPriceCents ?? 0 : values.priceCents) / 100).toFixed(2)}
              onChange={(e) => {
                const cents = Math.round(parseFloat(e.target.value) * 100);
                setValues((v) =>
                  v.format === "both" ? { ...v, digitalPriceCents: cents } : { ...v, priceCents: cents }
                );
              }}
            />
          </div>
          <p className="text-sm text-neutral-500 mt-2">
            Always sold via Stripe — required to grant web app access automatically.
          </p>
        </fieldset>
      )}

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
            <p role="alert" className="text-sm text-error mt-1">
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
                className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
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
                className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
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
              alt={values.imageAlt || "Untitled product image"}
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
                Alt text <span className="text-neutral-500 font-normal">(optional)</span>
              </label>
              <input
                id={altId}
                className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
                placeholder="Describe the image for screen reader users"
                value={values.imageAlt}
                onChange={(e) => setValues((v) => ({ ...v, imageAlt: e.target.value }))}
              />
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
        <p className="text-sm text-error" role="alert">
          {validationError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || deleting || uploading || noPurchaseRoute}
          className="bg-ink text-white rounded-lg px-6 py-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
        >
          {saving ? "Saving..." : "Save product"}
        </button>

        {initial?.id && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="text-error rounded-lg px-4 py-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error"
          >
            {deleting ? "Deleting..." : "Delete product"}
          </button>
        )}
      </div>
    </form>
  );
}
