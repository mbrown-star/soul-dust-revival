"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { defaultCoverAltText } from "@/lib/images/coverAltText";
import { IMMUTABLE_CACHE_CONTROL } from "@/lib/r2/cacheControl";

// Sanitizes a price input the same way ProductForm.tsx's own price fields
// do -- lets an admin type freely (including an in-progress "12." or a
// backspaced "") without a native number input's locale/stepper quirks.
function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}

export type BundleCandidate = {
  id: string;
  title: string;
  type: string;
  format: "physical" | "digital" | "both";
  priceCents: number;
  digitalPriceCents: number | null;
  imageUrl: string | null;
};

type BundleFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  priceCents: number;
  digitalPriceCents: number | null;
  imageUrl: string | null;
  imageAlt: string;
  format: "physical" | "digital" | "both";
  active: boolean;
  featured: boolean;
  componentProductIds: string[];
};

export function BundleForm({
  initial,
  candidates,
}: {
  initial?: Partial<BundleFormValues>;
  candidates: BundleCandidate[];
}) {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const descId = useId();
  const priceId = useId();
  const digitalPriceId = useId();
  const altId = useId();

  const [values, setValues] = useState<BundleFormValues>({
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    priceCents: initial?.priceCents ?? 0,
    digitalPriceCents: initial?.digitalPriceCents ?? null,
    imageUrl: initial?.imageUrl ?? null,
    imageAlt: initial?.imageAlt ?? "",
    format: initial?.format ?? "digital",
    active: initial?.active ?? true,
    featured: initial?.featured ?? false,
    componentProductIds: initial?.componentProductIds ?? [],
  });
  const [priceText, setPriceText] = useState(((initial?.priceCents ?? 0) / 100).toFixed(2));
  const [digitalPriceText, setDigitalPriceText] = useState(((initial?.digitalPriceCents ?? 0) / 100).toFixed(2));
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleTitleChange(title: string) {
    setValues((v) => ({
      ...v,
      title,
      slug: slugTouched ? v.slug : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    }));
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const key = `bundles/${crypto.randomUUID()}.${ext}`;

    try {
      const res = await fetch("/api/admin/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, contentType: file.type }),
      });
      const { uploadUrl, publicUrl } = (await res.json()) as { uploadUrl: string; publicUrl: string };
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type, "Cache-Control": IMMUTABLE_CACHE_CONTROL },
      });

      setValues((v) => ({
        ...v,
        imageUrl: publicUrl,
        // Only fills in a starting value -- never overwrites alt text the
        // admin already typed, e.g. on a later re-upload of a new cover.
        imageAlt: v.imageAlt.trim() ? v.imageAlt : defaultCoverAltText(v.title, "Front"),
      }));
    } finally {
      setUploading(false);
    }
  }

  function toggleComponent(id: string) {
    setValues((v) => ({
      ...v,
      componentProductIds: v.componentProductIds.includes(id)
        ? v.componentProductIds.filter((c) => c !== id)
        : [...v.componentProductIds, id],
    }));
  }

  // Sum of each selected part's own price (its digital price, for a "both"
  // product's digital side -- the only purchase route a bundle component
  // offers on its own, same as every normal AddToCartButton on that
  // product's page) -- shown next to the bundle price so an admin can see
  // the savings they're offering, not something the schema enforces.
  const partsTotalCents = values.componentProductIds.reduce((sum, id) => {
    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return sum;
    const price = candidate.format === "both" ? candidate.digitalPriceCents ?? candidate.priceCents : candidate.priceCents;
    return sum + price;
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const method = initial?.id ? "PATCH" : "POST";
    // digitalPriceCents only means anything for format "both" -- forced to
    // null otherwise regardless of whatever a prior "both" selection left in
    // state, so switching away from "both" can't submit a stale value the
    // schema would reject anyway (it requires exactly the opposite pairing).
    const payload = { ...values, digitalPriceCents: values.format === "both" ? values.digitalPriceCents : null };
    const body = initial?.id ? { ...payload, id: initial.id } : payload;

    try {
      const res = await fetch("/api/admin/bundles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({ message: "Save failed" }))) as { message?: unknown };
        setError(typeof data.message === "string" ? data.message : "Couldn't save — check the form for errors.");
        setSaving(false);
        return;
      }

      router.push("/admin/bundles");
      router.refresh();
    } catch {
      setError("Save failed — the server didn't respond as expected. Please try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (!window.confirm(`Delete "${values.title}"? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);

    const res = await fetch("/api/admin/bundles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: initial.id }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({ message: "Delete failed" }))) as { message?: unknown };
      setError(typeof data.message === "string" ? data.message : "Couldn't delete this bundle.");
      setDeleting(false);
      return;
    }

    router.push("/admin/bundles");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Bundle details">
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

      <fieldset>
        <legend className="block text-sm font-medium mb-1">What happens on purchase</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="format"
              checked={values.format === "digital"}
              onChange={() => setValues((v) => ({ ...v, format: "digital" }))}
            />
            <span className="text-sm">Unlocks in the web app (no shipping)</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="format"
              checked={values.format === "physical"}
              onChange={() => setValues((v) => ({ ...v, format: "physical" }))}
            />
            <span className="text-sm">Ships to you</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="format"
              checked={values.format === "both"}
              onChange={() =>
                setValues((v) => ({
                  ...v,
                  format: "both",
                  // Without this, a new bundle saved without ever touching the
                  // Digital price field (which already shows "0.00" from
                  // digitalPriceText's own initial state, looking already
                  // filled in) would submit digitalPriceCents: null with
                  // format: "both", which bundleSchema's refine rejects --
                  // same fix ProductForm.tsx's own format selector already
                  // applies for the identical reason.
                  ...(v.digitalPriceCents == null ? { digitalPriceCents: 0 } : {}),
                }))
              }
            />
            <span className="text-sm">Both — sold separately</span>
          </label>
        </div>
        <p className="text-xs text-moss mt-1">
          {values.format === "digital" &&
            "Buying this bundle grants access to every study/devotional below, same as buying each separately."}
          {values.format === "physical" &&
            "Always sold through Stripe (never Amazon). Collects a shipping address at checkout and emails the founder to pack and ship it — there's no automated fulfillment behind a bundle."}
          {values.format === "both" &&
            "Two independent purchases at their own prices below, same as a \"both\"-format product — buying the physical copy ships it (Stripe only, never Amazon) and emails the founder; buying digital access grants the entitlement cascade. A customer can buy either or both."}
        </p>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <div>
          <label htmlFor={priceId} className="block text-sm font-medium mb-1">
            {values.format === "both" ? "Physical price (USD)" : "Bundle price (USD)"}
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
        {values.format === "both" && (
          <div>
            <label htmlFor={digitalPriceId} className="block text-sm font-medium mb-1">
              Digital price (USD)
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
                  setValues((v) => ({ ...v, digitalPriceCents: Math.round(parsed * 100) }));
                }
              }}
              onBlur={() => setDigitalPriceText(((values.digitalPriceCents ?? 0) / 100).toFixed(2))}
            />
          </div>
        )}
      </div>
      {values.componentProductIds.length > 0 && values.format !== "both" && (
        // partsTotalCents sums each part's own single price (its digital
        // price for a "both"-format part) -- a one-to-one comparison against
        // this bundle's own single price for "physical"/"digital". A "both"
        // bundle has two independent prices of its own with no single
        // combined figure that means the same thing, so this comparison is
        // skipped rather than adding one up (physical + digital) that would
        // compare a different, bigger basket against partsTotalCents' one
        // price per part.
        <p className="text-xs text-moss -mt-3">
          Parts total ${(partsTotalCents / 100).toFixed(2)} separately
          {values.priceCents < partsTotalCents &&
            ` — this bundle saves $${((partsTotalCents - values.priceCents) / 100).toFixed(2)}`}
        </p>
      )}

      <div>
        <span className="block text-sm font-medium mb-1" id="bundle-cover-label">Master cover image</span>
        {values.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={values.imageUrl}
            alt={values.imageAlt || "Untitled bundle cover"}
            className="w-24 h-24 object-cover rounded mb-2"
          />
        )}
        <input
          type="file"
          accept="image/*"
          aria-labelledby="bundle-cover-label"
          onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
        />
        <p role="status" aria-live="polite" className="text-sm text-moss h-5">
          {uploading ? "Uploading..." : ""}
        </p>
        {values.imageUrl && (
          <div className="mt-2">
            <label htmlFor={altId} className="block text-sm font-medium mb-1">
              Alt text <span className="text-moss font-normal">(optional)</span>
            </label>
            <input
              id={altId}
              className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
              value={values.imageAlt}
              onChange={(e) => setValues((v) => ({ ...v, imageAlt: e.target.value }))}
            />
          </div>
        )}
      </div>

      <fieldset className="border rounded-lg p-4">
        <legend className="text-sm font-medium px-1">
          What&apos;s included <span className="text-error">*</span>
        </legend>
        <p className="text-xs text-moss mb-3">
          Each part keeps its own existing cover and price for an individual purchase — editing
          those happens on that part&apos;s own page, not here.
        </p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {candidates.map((c) => {
            const price = c.format === "both" ? c.digitalPriceCents ?? c.priceCents : c.priceCents;
            const checked = values.componentProductIds.includes(c.id);
            return (
              <label
                key={c.id}
                className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer ${
                  checked ? "border-ink bg-ink/5" : "border-moss/20"
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleComponent(c.id)} />
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" className="w-10 h-10 object-cover rounded" />
                ) : (
                  <div className="w-10 h-10 bg-moss/10 rounded" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="text-xs text-moss">
                    {c.type === "study_access" ? "Study" : "Book"} · ${(price / 100).toFixed(2)}
                  </p>
                </div>
              </label>
            );
          })}
          {candidates.length === 0 && <p className="text-sm text-moss">No existing products to choose from yet.</p>}
        </div>
      </fieldset>

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

      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving || deleting || uploading || values.componentProductIds.length === 0}>
          {saving ? "Saving..." : "Save bundle"}
        </Button>

        {initial?.id && (
          <Button type="button" variant="danger" onClick={handleDelete} disabled={saving || deleting}>
            {deleting ? "Deleting..." : "Delete bundle"}
          </Button>
        )}
      </div>
    </form>
  );
}
