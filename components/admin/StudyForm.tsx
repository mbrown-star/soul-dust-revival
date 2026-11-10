"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { defaultCoverAltText } from "@/lib/images/coverAltText";
import { useSavedIndicator } from "@/lib/hooks/useSavedIndicator";

type StudyFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  coverImageAlt: string;
  productId: string;
  kind: "devotional" | "study" | "book";
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
    kind: initial?.kind ?? "devotional",
    published: initial?.published ?? false,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { saved, markSaved } = useSavedIndicator();

  const altTextMissing = !!values.coverImageUrl && values.coverImageAlt.trim().length === 0;

  // Same facility as the Products cover-PDF uploader (a full-wrap back +
  // spine + front cover PDF, auto-cropped) -- a study has no back-cover
  // concept, so only the front crop is kept. This replaces a plain
  // image-file upload: admins already have this exact PDF for the study's
  // linked physical product, if it has one, rather than needing a separate
  // cover graphic prepared by hand.
  async function uploadCoverPdf(file: File) {
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.set("file", file);

    try {
      const res = await fetch("/api/admin/studies/cover-pdf", { method: "POST", body: formData });
      const data = (await res.json()) as { coverImageUrl?: string; message?: string };

      if (!res.ok || !data.coverImageUrl) {
        setUploadError(data.message ?? "Couldn't process that cover PDF. Please try a different file.");
        setUploading(false);
        return;
      }

      setValues((v) => ({
        ...v,
        coverImageUrl: data.coverImageUrl!,
        // Only fills in a starting value -- never overwrites alt text the
        // admin already typed, e.g. on a later re-upload of a new cover.
        coverImageAlt: v.coverImageAlt.trim() ? v.coverImageAlt : defaultCoverAltText(v.title, "Front"),
      }));
      setUploading(false);
    } catch {
      setUploadError("Upload failed — the server didn't respond as expected. Please try again.");
      setUploading(false);
    }
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

      setSaving(false);
      if (initial?.id) {
        // Editing an existing study stays on this same page -- there's
        // nowhere else to navigate to, and navigating away is itself what
        // used to pass for "did my save work?" feedback (see ProductForm's
        // equivalent fix) -- just refresh server data and show "Saved".
        router.refresh();
        markSaved();
      } else {
        // A brand-new study has somewhere real to go: its own edit page.
        router.push(`/admin/studies/${data.id}`);
        router.refresh();
      }
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

      <fieldset>
        <legend className="block text-sm font-medium mb-1">Kind</legend>
        <div className="flex gap-4">
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
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              checked={values.kind === "book"}
              onChange={() => setValues((v) => ({ ...v, kind: "book" }))}
            />
            <span className="text-sm">Book (no interactions)</span>
          </label>
        </div>
        <p className="text-xs text-moss mt-1">
          A Devotional is pure reading, no saved input. A Study has written-response questions
          whose answers are saved per user. &quot;Book&quot; mirrors the Product Kind field&apos;s own
          plain-reading option, for a study with no interactive content at all.
        </p>
      </fieldset>

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
          Only digital (or &quot;both&quot;-format) products appear here, since buying one directly
          grants entitlement to this study — this study&apos;s already-linked product is always
          included too, even if it&apos;s physical-only (e.g. access instead comes from a bundle
          purchase).
        </p>
      </div>

      <div>
        <span className="block text-sm font-medium mb-1" id="cover-image-label">
          Cover PDF (full wrap: back cover + spine + front cover, as exported for KDP print —
          only the front cover is kept)
        </span>
        {values.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={values.coverImageUrl}
            alt={values.coverImageAlt || "Untitled cover image — add alt text below"}
            className="h-32 w-auto rounded mb-2"
          />
        )}
        <input
          type="file"
          accept="application/pdf"
          aria-labelledby="cover-image-label"
          onChange={(e) => e.target.files?.[0] && uploadCoverPdf(e.target.files[0])}
        />
        <p role="status" aria-live="polite" className="text-sm text-moss h-5">
          {uploading ? "Processing cover PDF..." : ""}
        </p>
        {uploadError && (
          <p role="alert" className="text-sm text-error mt-1">
            {uploadError}
          </p>
        )}

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

        <p role="status" aria-live="polite" className="text-sm text-moss">
          {saved ? "Saved" : ""}
        </p>
      </div>
    </form>
  );
}
