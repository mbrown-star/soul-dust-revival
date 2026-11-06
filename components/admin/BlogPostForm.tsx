"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "./RichTextEditor";
import { Button } from "@/components/ui/Button";

type BlogFormValues = {
  id?: string;
  title: string;
  slug: string;
  body: string;
  published: boolean;
};

export function BlogPostForm({ initial }: { initial?: Partial<BlogFormValues> }) {
  const router = useRouter();
  const titleId = useId();
  const slugId = useId();
  const bodyId = useId();
  const instructionId = useId();

  const [values, setValues] = useState<BlogFormValues>({
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    body: initial?.body ?? "",
    published: initial?.published ?? false,
  });
  const [slugTouched, setSlugTouched] = useState(!!initial?.slug);
  const [customInstruction, setCustomInstruction] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [drafts, setDrafts] = useState<{ title: string; body: string }[]>([]);
  const [usedAiDraft, setUsedAiDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Tiptap's "empty" output is markup like <p></p>, not an empty string, so
  // checking values.body.length alone wouldn't catch an empty post -- same
  // check the schema runs server-side (lib/validation/schemas.ts).
  const bodyEmpty = values.body.replace(/<[^>]*>/g, "").trim().length === 0;

  function handleTitleChange(title: string) {
    setValues((v) => ({
      ...v,
      title,
      slug: slugTouched ? v.slug : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    }));
  }

  async function getSuggestions() {
    setSuggesting(true);
    setError(null);
    const res = await fetch("/api/admin/blog/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customInstruction: customInstruction || undefined }),
    });
    const data = (await res.json()) as { message?: string; drafts: { title: string; body: string }[] };
    if (!res.ok) {
      setError(data.message ?? "Couldn't get suggestions.");
      setSuggesting(false);
      return;
    }
    setDrafts(data.drafts);
    setSuggesting(false);
  }

  function acceptDraft(draft: { title: string; body: string }) {
    handleTitleChange(draft.title);
    setValues((v) => ({ ...v, body: draft.body }));
    setUsedAiDraft(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (bodyEmpty) return;
    setSaving(true);
    setError(null);

    const method = initial?.id ? "PATCH" : "POST";
    const payload = initial?.id
      ? { id: initial.id, ...values }
      : { ...values, sourceType: usedAiDraft ? "ai_suggested" : "manual", aiPrompt: customInstruction || undefined };

    // Guards against both a validation failure (res.ok false, a real error
    // body to show) and a genuinely broken response (network failure, or a
    // server crash returning an empty/non-JSON body, where res.json() itself
    // throws) -- either way this always surfaces an error and always resets
    // saving, instead of leaving the button on "Saving..." forever with no
    // feedback.
    try {
      const res = await fetch("/api/admin/blog/posts", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { id?: string; message?: string };

      if (!res.ok || !data.id) {
        setError(data.message ?? "Couldn't save that post.");
        setSaving(false);
        return;
      }

      // Editing an existing post pushes to the URL it's already on, which is a
      // no-op navigation -- this component stays mounted, so saving must be
      // cleared explicitly here rather than relying on a route change to reset
      // it (that only happened to work for a brand-new post, which navigates
      // to a different URL and unmounts this instance).
      setSaving(false);
      router.push(`/admin/blog/${data.id}`);
      router.refresh();
    } catch {
      setError("Save failed — the server didn't respond as expected. Please try again.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id) return;
    if (!window.confirm(`Delete "${values.title || "this post"}"? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);

    const res = await fetch("/api/admin/blog/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: initial.id }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({ message: "Delete failed" }))) as { message?: unknown };
      setError(typeof data.message === "string" ? data.message : "Couldn't delete this post.");
      setDeleting(false);
      return;
    }

    router.push("/admin/blog");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* AI suggestions */}
      <div className="border rounded-lg p-4 bg-moss/5">
        <label htmlFor={instructionId} className="block text-sm font-medium mb-1">
          Ask Claude for a draft (optional)
        </label>
        <div className="flex gap-2">
          <input
            id={instructionId}
            className="flex-1 border rounded-lg p-2 text-sm"
            placeholder="e.g. write about the Foundations study launch"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
          />
          <button
            onClick={getSuggestions}
            disabled={suggesting}
            className="bg-ink text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {suggesting ? "Thinking..." : drafts.length > 0 ? "Refresh suggestions" : "Get suggestions"}
          </button>
        </div>
        <p className="text-xs text-moss mt-1">
          Drafts are grounded in your recent published studies, lessons, and blog posts.
        </p>
        {drafts.length > 0 && (
          <div className="space-y-2 mt-3">
            {drafts.map((draft, i) => (
              <button
                key={i}
                onClick={() => acceptDraft(draft)}
                className="block w-full text-left border rounded-lg p-3 text-sm bg-white hover:border-moss"
              >
                <p className="font-medium mb-1">{draft.title}</p>
                {/* The draft body is HTML -- strip tags for this plain-text preview snippet. */}
                <p className="text-moss line-clamp-2">
                  {draft.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)}...
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor={titleId} className="block text-sm font-medium mb-1">Title</label>
          <input
            id={titleId}
            required
            className="w-full border rounded-lg p-3"
            value={values.title}
            onChange={(e) => handleTitleChange(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor={slugId} className="block text-sm font-medium mb-1">Slug</label>
          <input
            id={slugId}
            required
            className="w-full border rounded-lg p-3"
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setValues((v) => ({ ...v, slug: e.target.value }));
            }}
          />
        </div>

        <div>
          <label id={bodyId} className="block text-sm font-medium mb-1">Body</label>
          <div aria-labelledby={bodyId}>
            <RichTextEditor content={values.body} onChange={(html) => setValues((v) => ({ ...v, body: html }))} />
          </div>
          {submitAttempted && bodyEmpty && (
            <p role="alert" className="text-sm text-error mt-1">Body can&apos;t be empty.</p>
          )}
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.published}
            onChange={(e) => setValues((v) => ({ ...v, published: e.target.checked }))}
          />
          <span className="text-sm">Published (live on the public blog)</span>
        </label>

        {error && <p role="alert" className="text-sm text-error">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || deleting || bodyEmpty}>
            {saving ? "Saving..." : values.published ? "Save & publish" : "Save draft"}
          </Button>

          {initial?.id && (
            <Button type="button" variant="danger" onClick={handleDelete} disabled={saving || deleting}>
              {deleting ? "Deleting..." : "Delete post"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
