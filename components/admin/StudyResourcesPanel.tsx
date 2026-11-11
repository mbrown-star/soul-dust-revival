"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { UploadProgressBar } from "@/components/admin/builder/MediaSourceField";
import { putToSlot, requestUploadSlots, UploadError } from "@/lib/r2/browserUpload";
import { fileTypeLabel, formatFileSize } from "@/lib/format/fileSize";
import { oversizeMessage, STUDY_RESOURCE_UPLOAD_MAX_BYTES } from "@/lib/uploads/limits";

export type AdminStudyResource = {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileSize: number;
  contentType: string;
};

const inputClass = "w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink";

async function send(method: "POST" | "PATCH" | "DELETE", body: unknown): Promise<Response> {
  return fetch("/api/admin/study-resources", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { message?: unknown };
    return typeof data.message === "string" ? data.message : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The "Resources" panel on a study's admin page: PDFs that the study's owners
 * can download from its page (a companion catalog, a guide).
 */
export function StudyResourcesPanel({ studyId, initial }: { studyId: string; initial: AdminStudyResource[] }) {
  const [resources, setResources] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function move(index: number, delta: -1 | 1) {
    const next = [...resources];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    const previous = resources;
    setResources(next);
    setError(null);
    const res = await send("PATCH", { studyId, order: next.map((r) => r.id) }).catch(() => null);
    if (!res?.ok) {
      setResources(previous);
      setError(res ? await readMessage(res, "Couldn't reorder.") : "Couldn't reorder. Check your connection.");
      return;
    }
    setStatus(`Moved ${item!.title} ${delta < 0 ? "up" : "down"}.`);
  }

  async function remove(resource: AdminStudyResource) {
    if (!window.confirm(`Remove "${resource.title}"? Readers will no longer be able to download it.`)) return;
    setError(null);
    const res = await send("DELETE", { id: resource.id }).catch(() => null);
    if (!res?.ok) {
      setError(res ? await readMessage(res, "Couldn't remove it.") : "Couldn't remove it. Check your connection.");
      return;
    }
    setResources((list) => list.filter((r) => r.id !== resource.id));
    setStatus(`Removed ${resource.title}.`);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-moss">
        PDFs that people who own this study can download from its page, such as a companion catalog or a guide.
        Free-sample readers see them listed, locked.
      </p>

      {resources.length === 0 ? (
        <p className="text-sm text-moss">No resources yet.</p>
      ) : (
        <ul aria-label="Study resources" className="divide-y border rounded-lg">
          {resources.map((resource, index) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              isFirst={index === 0}
              isLast={index === resources.length - 1}
              onMove={(delta) => void move(index, delta)}
              onRemove={() => void remove(resource)}
              onSaved={(updated) => {
                setResources((list) => list.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
                setStatus(`Saved ${updated.title}.`);
              }}
            />
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <AddResourceForm
        studyId={studyId}
        onAdded={(resource) => {
          setResources((list) => [...list, resource]);
          setStatus(`Added ${resource.title}.`);
        }}
      />
    </div>
  );
}

function ResourceRow({
  resource,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onSaved,
}: {
  resource: AdminStudyResource;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onSaved: (updated: Pick<AdminStudyResource, "id" | "title" | "description">) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  async function save() {
    setSaving(true);
    setError(null);
    const res = await send("PATCH", { id: resource.id, title, description: description.trim() || null }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError(res ? await readMessage(res, "Couldn't save. Check the title.") : "Couldn't save. Check your connection.");
      return;
    }
    onSaved({ id: resource.id, title: title.trim(), description: description.trim() || null });
    setEditing(false);
  }

  return (
    <li className="p-4 space-y-3">
      {editing ? (
        <div className="space-y-3">
          <div>
            <label htmlFor={titleId} className="block text-sm font-medium mb-1">
              Title
            </label>
            <input id={titleId} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label htmlFor={descriptionId} className="block text-sm font-medium mb-1">
              Description <span className="text-moss font-normal">(optional)</span>
            </label>
            <textarea
              id={descriptionId}
              rows={2}
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !title.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditing(false);
                setTitle(resource.title);
                setDescription(resource.description ?? "");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{resource.title}</p>
            {resource.description && <p className="text-sm text-moss">{resource.description}</p>}
            <p className="text-xs text-moss mt-1">
              {resource.fileName} · {fileTypeLabel(resource.contentType)} · {formatFileSize(resource.fileSize)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onMove(-1)}
              disabled={isFirst}
              aria-label={`Move ${resource.title} up`}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onMove(1)}
              disabled={isLast}
              aria-label={`Move ${resource.title} down`}
            >
              ↓
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button type="button" size="sm" variant="danger" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function AddResourceForm({ studyId, onAdded }: { studyId: string; onAdded: (resource: AdminStudyResource) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const titleId = useId();
  const descriptionId = useId();
  const fileId = useId();

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf") {
      setError("Resources must be PDF files.");
      return;
    }
    const tooBig = oversizeMessage(file.size, STUDY_RESOURCE_UPLOAD_MAX_BYTES);
    if (tooBig) {
      setError(tooBig);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const slot = await requestUploadSlots<{ uploadUrl: string; key: string }>("/api/admin/study-resource-upload-url", {
        contentType: "application/pdf",
        size: file.size,
      });
      await putToSlot(slot, file, "application/pdf", setProgress);
      const res = await send("POST", {
        studyId,
        title,
        description: description.trim() || null,
        fileKey: slot.key,
        fileName: file.name,
      });
      if (!res.ok) throw new UploadError(await readMessage(res, "Couldn't add the resource."));
      onAdded((await res.json()) as AdminStudyResource);
      setTitle("");
      setDescription("");
      setFile(null);
      setFormKey((k) => k + 1); // clears the file input
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "Couldn't add the resource. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form key={formKey} onSubmit={(e) => void add(e)} className="border rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium">Add a resource</p>
      <div>
        <label htmlFor={titleId} className="block text-sm font-medium mb-1">
          Title
        </label>
        <input
          id={titleId}
          required
          maxLength={200}
          className={inputClass}
          placeholder="e.g. A Scriptural Catalog of Benedictions"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={descriptionId} className="block text-sm font-medium mb-1">
          Description <span className="text-moss font-normal">(optional)</span>
        </label>
        <textarea
          id={descriptionId}
          rows={2}
          maxLength={1000}
          className={inputClass}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={fileId} className="block text-sm font-medium mb-1">
          PDF file <span className="text-moss font-normal">(up to {formatFileSize(STUDY_RESOURCE_UPLOAD_MAX_BYTES)})</span>
        </label>
        <input
          id={fileId}
          type="file"
          accept="application/pdf"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <UploadProgressBar active={uploading} percent={progress} label="resource" />
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <Button type="submit" disabled={uploading || !file || !title.trim()}>
        {uploading ? "Adding..." : "Add resource"}
      </Button>
    </form>
  );
}
