"use client";

import { useId } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";

export type RichTextSnippet = { label: string; html: string };

export function RichTextEditor({
  content,
  onChange,
  snippets,
  label,
}: {
  content: string;
  onChange: (html: string) => void;
  /** Ready-made sections offered in an "Insert section" menu. */
  snippets?: RichTextSnippet[];
  /** Accessible name for the editable area. */
  label?: string;
}) {
  const insertId = useId();
  const editor = useEditor({
    // StarterKit bundles Link as of Tiptap v3 (it didn't in v2, hence the
    // separate @tiptap/extension-link import this used to need) — setLink()
    // below still works the same, just via StarterKit's own copy now.
    extensions: [StarterKit, TiptapImage],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose max-w-none border rounded-lg p-3 min-h-[150px] focus:outline-none focus:ring-2 focus:ring-ink",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label ?? "Rich text",
      },
    },
    // Tiptap v3 no longer re-renders the React editor on every transaction
    // by default — without this, the toolbar buttons' active-state
    // highlighting (editor.isActive("bold"), etc., below) would stop
    // updating live as the cursor moves/selection changes, which reads as a
    // silently broken toolbar rather than an intentional behavior change.
    shouldRerenderOnTransaction: true,
  });

  if (!editor) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2 text-sm">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 border rounded ${editor.isActive("bold") ? "bg-ink text-white" : ""}`}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 border rounded ${editor.isActive("italic") ? "bg-ink text-white" : ""}`}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 border rounded ${editor.isActive("bulletList") ? "bg-ink text-white" : ""}`}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-1 border rounded ${editor.isActive("heading", { level: 2 }) ? "bg-ink text-white" : ""}`}
        >
          Heading
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          className="px-2 py-1 border rounded"
        >
          Link
        </button>
        {snippets && snippets.length > 0 && (
          <>
            <label htmlFor={insertId} className="sr-only">
              Insert section
            </label>
            <select
              id={insertId}
              value=""
              onChange={(e) => {
                const snippet = snippets.find((s) => s.label === e.target.value);
                if (snippet) editor.chain().focus().insertContent(snippet.html).run();
              }}
              className="px-2 py-1 border rounded bg-white"
            >
              <option value="">Insert section…</option>
              {snippets.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
