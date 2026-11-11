"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { defaultCoverAltText } from "@/lib/images/coverAltText";
import { readImageDimensions } from "@/lib/images/readImageDimensions";
import { CoverUploadError, uploadBookCoverPdf, type UploadedBookCover } from "@/lib/images/uploadBookCover";
import { UploadError, uploadFileToR2 } from "@/lib/r2/browserUpload";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/uploads/limits";
import { useSavedIndicator } from "@/lib/hooks/useSavedIndicator";

// Keeps only digits and at most one decimal point -- lets an admin type a
// price freely (including an in-progress "12." or a backspaced "") without
// a native number input's locale/stepper quirks getting in the way.
function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

type ProductFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  priceCents: number;
  digitalPriceCents: number | null;
  format: "physical" | "digital" | "both";
  type: string;
  kind: "study" | "devotional" | "book";
  bookBinding: "softback" | "hardback" | null;
  imageUrl: string | null;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  backImageUrl: string | null;
  backImageAlt: string;
  backImageWidth: number | null;
  backImageHeight: number | null;
  coverPdfUrl: string | null;
  amazonUrl: string | null;
  sellOnStripe: boolean;
  sellOnAmazon: boolean;
  comingSoon: boolean;
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
  const bookBindingId = useId();
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
    kind: initial?.kind ?? "book",
    bookBinding: initial?.bookBinding ?? null,
    imageUrl: initial?.imageUrl ?? null,
    imageAlt: initial?.imageAlt ?? "",
    imageWidth: initial?.imageWidth ?? null,
    imageHeight: initial?.imageHeight ?? null,
    backImageUrl: initial?.backImageUrl ?? null,
    backImageAlt: initial?.backImageAlt ?? "",
    backImageWidth: initial?.backImageWidth ?? null,
    backImageHeight: initial?.backImageHeight ?? null,
    coverPdfUrl: initial?.coverPdfUrl ?? null,
    amazonUrl: initial?.amazonUrl ?? null,
    sellOnStripe: initial?.sellOnStripe ?? true,
    sellOnAmazon: initial?.sellOnAmazon ?? !!initial?.amazonUrl,
    comingSoon: initial?.comingSoon ?? false,
    active: initial?.active ?? true,
    featured: initial?.featured ?? false,
  });
  const [priceText, setPriceText] = useState(((initial?.priceCents ?? 0) / 100).toFixed(2));
  const [digitalPriceText, setDigitalPriceText] = useState(
    (((initial?.format === "both" ? initial?.digitalPriceCents : initial?.priceCents) ?? 0) / 100).toFixed(2)
  );
  // The digital-price field represents priceCents when format is "digital"
  // but digitalPriceCents when format is "both" -- re-sync its own display
  // text only when that target switches (not on every keystroke, which
  // would fight the user's typing by reformatting mid-edit). Adjusted
  // during render rather than in an effect, per React's own guidance for
  // resetting state when a value changes -- no extra render pass, and no
  // risk of fighting an in-progress keystroke the way an effect could.
  const [formatForDigitalText, setFormatForDigitalText] = useState(values.format);
  if (formatForDigitalText !== values.format) {
    setFormatForDigitalText(values.format);
    const cents = values.format === "both" ? values.digitalPriceCents ?? 0 : values.priceCents;
    setDigitalPriceText((cents / 100).toFixed(2));
  }
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { saved, markSaved } = useSavedIndicator();

  const isBook = values.type === "book";
  // "Both" sells the physical and digital versions of the same title as two
  // independent purchases — Book Purchase Options cover the physical side
  // (same fields as a plain "physical" product), Digital Purchase Options
  // cover the digital side (always Stripe-only, its own price).
  const showBookOptions = values.format === "physical" || values.format === "both";
  const showDigitalOptions = values.format === "digital" || values.format === "both";
  // Amazon counts even before its link exists ("Coming soon on Amazon"), and
  // a Coming soon title needs no route yet.
  const noPurchaseRoute = showBookOptions && !values.comingSoon && !values.sellOnStripe && !values.sellOnAmazon;

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
    setUploadError(null);

    // There's no server-side decode step on this plain (non-PDF-split)
    // upload path -- the file goes straight to R2 via the presigned PUT
    // below -- so this is the only place the image's real dimensions can be
    // read at all. A failure here (a corrupt/unreadable file) still lets
    // the upload itself proceed; the display layer falls back to a
    // reasonable default ratio when these are null.
    const dimensions = await readImageDimensions(file).catch(() => null);

    try {
      const publicUrl = await uploadFileToR2({
        endpoint: "/api/admin/upload-url",
        request: { folder: "products" },
        file,
        contentType: file.type,
        maxBytes: IMAGE_UPLOAD_MAX_BYTES,
      });
      setValues((v) => ({
        ...v,
        imageUrl: publicUrl,
        imageWidth: dimensions?.width ?? null,
        imageHeight: dimensions?.height ?? null,
      }));
    } catch (err) {
      setUploadError(err instanceof UploadError ? err.message : "Couldn't upload that image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleCoverPdfUpload(file: File) {
    setUploading(true);
    setUploadError(null);

    let cover: UploadedBookCover;
    try {
      cover = await uploadBookCoverPdf(file, "product");
    } catch (err) {
      setUploadError(
        err instanceof CoverUploadError ? err.message : "Couldn't process that cover PDF. Please try a different file."
      );
      setUploading(false);
      return;
    }

    setValues((v) => ({
      ...v,
      coverPdfUrl: cover.coverPdfUrl,
      backImageUrl: cover.backImageUrl,
      backImageWidth: cover.backWidth,
      backImageHeight: cover.backHeight,
      imageUrl: cover.frontImageUrl,
      imageWidth: cover.frontWidth,
      imageHeight: cover.frontHeight,
      // Only fills in a starting value -- never overwrites alt text the
      // admin already typed, e.g. on a later re-upload of a new cover.
      imageAlt: v.imageAlt.trim() ? v.imageAlt : defaultCoverAltText(v.title, "Front"),
      backImageAlt: v.backImageAlt.trim() ? v.backImageAlt : defaultCoverAltText(v.title, "Back"),
    }));
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    if (noPurchaseRoute) return;
    setSaving(true);

    const method = initial?.id ? "PATCH" : "POST";
    // An empty Amazon link (not known yet) submits as null, so it doesn't
    // fail the server's url() validation; sellOnAmazon keeps the choice.
    const sellOnAmazon = showBookOptions && values.sellOnAmazon;
    const payload = {
      ...values,
      sellOnAmazon,
      amazonUrl: sellOnAmazon && values.amazonUrl?.trim() ? values.amazonUrl.trim() : null,
      digitalPriceCents: values.format === "both" ? values.digitalPriceCents : null,
      // Binding only describes a physical copy -- matches productSchema's
      // own refine rejecting it for a purely digital product.
      bookBinding: showBookOptions ? values.bookBinding : null,
    };
    const body = initial?.id ? { ...payload, id: initial.id } : payload;

    try {
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

      setSaving(false);
      if (initial?.id) {
        // Editing an existing product stays on this same page -- there's
        // nowhere else to navigate to, and silently bouncing to the list
        // used to be the only "did my save work?" signal at all. Refresh
        // server data and show "Saved" instead.
        router.refresh();
        markSaved();
      } else {
        // A brand-new product has somewhere real to go: the list it'll now
        // appear in.
        router.push("/admin/products");
        router.refresh();
      }
    } catch {
      // A network failure here (not a server error response, which is
      // handled above) would otherwise leave the button on "Saving..."
      // forever with setSaving(false) never reached.
      setValidationError("Save failed — the server didn't respond as expected. Please try again.");
      setSaving(false);
    }
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
          Slug (URL path — used for the public /store/[slug] page)
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
              ...(format === "digital" ? { amazonUrl: null, sellOnAmazon: false, sellOnStripe: true } : {}),
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

      <fieldset>
        <legend className="block text-sm font-medium mb-1">Kind</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              checked={values.kind === "book"}
              onChange={() => setValues((v) => ({ ...v, kind: "book" }))}
            />
            <span className="text-sm">Book (no interactions)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              checked={values.kind === "devotional"}
              onChange={() => setValues((v) => ({ ...v, kind: "devotional" }))}
            />
            <span className="text-sm">Devotional (reader-only)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              checked={values.kind === "study"}
              onChange={() => setValues((v) => ({ ...v, kind: "study" }))}
            />
            <span className="text-sm">Study (interactive, saves answers)</span>
          </label>
        </div>
        <p className="text-xs text-moss mt-1">
          What this product&apos;s companion content actually is, shown in its own storefront
          eyebrow — independent of Format above (which is about how it&apos;s sold/delivered).
          &quot;Book&quot; is the right choice whenever there&apos;s no linked study at all.
        </p>
      </fieldset>

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
              type="text"
              inputMode="decimal"
              className="w-full sm:w-48 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
              value={priceText}
              onChange={(e) => {
                const sanitized = sanitizeDecimal(e.target.value);
                setPriceText(sanitized);
                const parsed = parseFloat(sanitized);
                if (!Number.isNaN(parsed)) {
                  setValues((v) => ({ ...v, priceCents: Math.round(parsed * 100) }));
                }
              }}
              onBlur={() => setPriceText((values.priceCents / 100).toFixed(2))}
            />
          </div>

          <div className="mb-3">
            <label htmlFor={bookBindingId} className="block text-sm font-medium mb-1">
              Binding <span className="text-moss font-normal">(optional)</span>
            </label>
            <select
              id={bookBindingId}
              className="w-full sm:w-48 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
              value={values.bookBinding ?? ""}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  bookBinding: e.target.value ? (e.target.value as "softback" | "hardback") : null,
                }))
              }
            >
              <option value="">Not specified</option>
              <option value="softback">Softback</option>
              <option value="hardback">Hardback</option>
            </select>
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
                checked={values.sellOnAmazon}
                onChange={(e) => setValues((v) => ({ ...v, sellOnAmazon: e.target.checked }))}
              />
              <span className="text-sm">Sell via Amazon (shows a &quot;Buy on Amazon&quot; button)</span>
            </label>

            {values.sellOnAmazon && (
              <div>
                <label htmlFor={amazonUrlId} className="block text-sm font-medium mb-1">
                  Amazon product URL <span className="text-moss font-normal">(optional until you have it)</span>
                </label>
                <input
                  id={amazonUrlId}
                  type="url"
                  aria-describedby={`${amazonUrlId}-note`}
                  placeholder="https://www.amazon.com/dp/XXXXXXXXXX"
                  className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
                  value={values.amazonUrl ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, amazonUrl: e.target.value }))}
                />
                <p id={`${amazonUrlId}-note`} className="text-xs text-moss mt-1">
                  Without a link, the product page shows &quot;Coming soon on Amazon&quot; in place of the button.
                </p>
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
              type="text"
              inputMode="decimal"
              className="w-full sm:w-48 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
              value={digitalPriceText}
              onChange={(e) => {
                const sanitized = sanitizeDecimal(e.target.value);
                setDigitalPriceText(sanitized);
                const parsed = parseFloat(sanitized);
                if (!Number.isNaN(parsed)) {
                  const cents = Math.round(parsed * 100);
                  setValues((v) =>
                    v.format === "both" ? { ...v, digitalPriceCents: cents } : { ...v, priceCents: cents }
                  );
                }
              }}
              onBlur={() => {
                const cents = values.format === "both" ? values.digitalPriceCents ?? 0 : values.priceCents;
                setDigitalPriceText((cents / 100).toFixed(2));
              }}
            />
          </div>
          <p className="text-sm text-moss mt-2">
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
                className="h-32 w-auto rounded"
              />
            )}
            {values.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={values.imageUrl}
                alt={values.imageAlt || "Front cover preview"}
                className="h-32 w-auto rounded"
              />
            )}
          </div>
          <input
            type="file"
            accept="application/pdf"
            aria-labelledby="cover-pdf-label"
            onChange={(e) => e.target.files?.[0] && handleCoverPdfUpload(e.target.files[0])}
          />
          <p role="status" aria-live="polite" className="text-sm text-moss h-5">
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
                Back cover alt text <span className="text-moss font-normal">(optional)</span>
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
                Front cover alt text <span className="text-moss font-normal">(optional)</span>
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
          <p role="status" aria-live="polite" className="text-sm text-moss h-5">
            {uploading ? "Uploading..." : ""}
          </p>
          {uploadError && (
            <p role="alert" className="text-sm text-error mt-1">
              {uploadError}
            </p>
          )}

          {values.imageUrl && (
            <div className="mt-2">
              <label htmlFor={altId} className="block text-sm font-medium mb-1">
                Alt text <span className="text-moss font-normal">(optional)</span>
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

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.comingSoon}
            aria-describedby={`${priceId}-coming-soon-note`}
            onChange={(e) => setValues((v) => ({ ...v, comingSoon: e.target.checked }))}
          />
          <span className="text-sm">Coming soon (shown in the store, not for sale yet)</span>
        </label>
        <p id={`${priceId}-coming-soon-note`} className="text-xs text-moss mt-1 ml-6">
          Shows &quot;Coming soon&quot; instead of a price and buy buttons. Prices and purchase options can wait
          until you have them; untick this when it goes on sale.
        </p>
      </div>

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
        <Button type="submit" disabled={saving || deleting || uploading || noPurchaseRoute}>
          {saving ? "Saving..." : "Save product"}
        </Button>

        {initial?.id && (
          <Button type="button" variant="danger" onClick={handleDelete} disabled={saving || deleting}>
            {deleting ? "Deleting..." : "Delete product"}
          </Button>
        )}

        <p role="status" aria-live="polite" className="text-sm text-moss">
          {saved ? "Saved" : ""}
        </p>
      </div>
    </form>
  );
}
