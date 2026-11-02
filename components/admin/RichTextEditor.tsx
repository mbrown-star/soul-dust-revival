"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapImage from "@tiptap/extension-image";

export function RichTextEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    // StarterKit bundles Link as of Tiptap v3 (it didn't in v2, hence the
    // separate @tiptap/extension-link import this used to need) — setLink()
    // below still works the same, just via StarterKit's own copy now.
    extensions: [StarterKit, TiptapImage],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "prose max-w-none border rounded-lg p-3 min-h-[150px] focus:outline-none",
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
          className={`px-2 py-1 border rounded ${editor.isActive("bold") ? "bg-neutral-900 text-white" : ""}`}
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 border rounded ${editor.isActive("italic") ? "bg-neutral-900 text-white" : ""}`}
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 border rounded ${editor.isActive("bulletList") ? "bg-neutral-900 text-white" : ""}`}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-1 border rounded ${editor.isActive("heading", { level: 2 }) ? "bg-neutral-900 text-white" : ""}`}
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
