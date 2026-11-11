import { LockIcon } from "@/components/study/LockIcon";
import { fileTypeLabel, formatFileSize } from "@/lib/format/fileSize";

export type StudyResourceItem = {
  id: string;
  title: string;
  description: string | null;
  fileSize: number;
  contentType: string;
};

/**
 * A study's downloadable resources. Owners (and admins) get a Download link
 * through /api/study-resources/[id], which checks access again; a free-sample
 * reader sees what's included, locked.
 */
export function StudyResources({
  resources,
  locked,
  lockedNote,
}: {
  resources: StudyResourceItem[];
  locked: boolean;
  lockedNote: string;
}) {
  if (resources.length === 0) return null;
  return (
    <section aria-labelledby="study-resources-heading" className="mt-12">
      <h2 id="study-resources-heading" className="font-display font-bold text-2xl text-ink mb-4">
        Resources
      </h2>
      <ul className="space-y-3">
        {resources.map((r) => (
          <li
            key={r.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-dusk/10 rounded-lg px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-sans font-semibold text-ink">{r.title}</p>
              {r.description && <p className="font-serif text-sm text-moss mt-0.5">{r.description}</p>}
              <p className="font-sans text-xs text-moss mt-1">
                {fileTypeLabel(r.contentType)} · {formatFileSize(r.fileSize)}
              </p>
            </div>
            {locked ? (
              <span className="flex items-center gap-1.5 font-sans text-xs text-moss whitespace-nowrap">
                <LockIcon className="w-3.5 h-3.5" />
                {lockedNote}
              </span>
            ) : (
              <a
                href={`/api/study-resources/${r.id}`}
                className="inline-flex items-center justify-center font-sans font-semibold text-sm bg-ink text-parchment rounded-lg px-4 py-2 min-h-[44px] hover:bg-dusk focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink whitespace-nowrap"
                aria-label={`Download ${r.title} (${fileTypeLabel(r.contentType)}, ${formatFileSize(r.fileSize)})`}
              >
                Download
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
