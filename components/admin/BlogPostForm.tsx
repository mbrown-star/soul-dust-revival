"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";

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
  const [error, setError] = useState<string | null>(null);

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
    const data = await res.json();
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
    setSaving(true);
    setError(null);

    const method = initial?.id ? "PATCH" : "POST";
    const payload = initial?.id
      ? { id: initial.id, ...values }
      : { ...values, sourceType: usedAiDraft ? "ai_suggested" : "manual", aiPrompt: customInstruction || undefined };

    const res = await fetch("/api/admin/blog/posts", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message ?? "Couldn't save that post.");
      setSaving(false);
      return;
    }

    router.push(`/admin/blog/${data.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* AI suggestions */}
      <div className="border rounded-lg p-4 bg-neutral-50">
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
            className="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {suggesting ? "Thinking..." : drafts.length > 0 ? "Refresh suggestions" : "Get suggestions"}
          </button>
        </div>
        <p className="text-xs text-neutral-400 mt-1">
          Drafts are grounded in your recent published studies, lessons, and blog posts.
        </p>
        {drafts.length > 0 && (
          <div className="space-y-2 mt-3">
            {drafts.map((draft, i) => (
              <button
                key={i}
                onClick={() => acceptDraft(draft)}
                className="block w-full text-left border rounded-lg p-3 text-sm bg-white hover:border-neutral-400"
              >
                <p className="font-medium mb-1">{draft.title}</p>
                <p className="text-neutral-500 line-clamp-2">{draft.body.slice(0, 160)}...</p>
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
          <label htmlFor={bodyId} className="block text-sm font-medium mb-1">Body (markdown)</label>
          <textarea
            id={bodyId}
            required
            rows={14}
            className="w-full border rounded-lg p-3 font-mono text-sm"
            value={values.body}
            onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))}
          />
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.published}
            onChange={(e) => setValues((v) => ({ ...v, published: e.target.checked }))}
          />
          <span className="text-sm">Published (live on the public blog)</span>
        </label>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="bg-neutral-900 text-white rounded-lg px-6 py-3 disabled:opacity-50"
        >
          {saving ? "Saving..." : values.published ? "Save & publish" : "Save draft"}
        </button>
      </form>
    </div>
  );
}
