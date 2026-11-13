import Link from "next/link";

export type BookContentsRow = {
  lessonId: string;
  href: string;
  label: string; // "Introduction", "Chapter 1", "Epilogue"
  title: string | null; // the chapter's title; null for the Introduction
  part: string | null; // "Part One · The Dust"
  status: "not_started" | "in_progress" | "completed";
  isCurrent: boolean;
  locked: boolean;
};

/**
 * The book's table of contents, grouped under its Parts in book order, with
 * what this reader has read. A chapter they can't open yet is listed but not
 * linked.
 */
export function BookContents({ rows }: { rows: BookContentsRow[] }) {
  // Consecutive rows with the same Part form one group; the Introduction and
  // Epilogue (no Part) each stand alone.
  const groups: { part: string | null; rows: BookContentsRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.part === row.part && row.part !== null) last.rows.push(row);
    else groups.push({ part: row.part, rows: [row] });
  }

  return (
    <div className="space-y-8">
      {groups.map((group, i) => (
        <section key={i} className="space-y-2">
          {group.part && (
            <h2 className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700">{group.part}</h2>
          )}
          <ol className="divide-y divide-dusk/10 border-y border-dusk/10">
            {group.rows.map((row) => {
              const inner = (
                <>
                  <span className="flex-1 min-w-0">
                    <span className="block font-sans text-xs font-semibold uppercase tracking-wide text-moss">{row.label}</span>
                    {row.title && <span className="block font-serif text-ink">{row.title}</span>}
                  </span>
                  <span className="shrink-0 font-sans text-xs font-semibold text-moss">
                    {row.locked
                      ? "Locked"
                      : row.status === "completed"
                        ? "✓ Read"
                        : row.status === "in_progress"
                          ? "Started"
                          : ""}
                  </span>
                </>
              );
              return (
                <li key={row.lessonId}>
                  {row.locked ? (
                    <div className="flex items-center gap-3 py-3 opacity-60">{inner}</div>
                  ) : (
                    <Link
                      href={row.href}
                      aria-current={row.isCurrent ? "page" : undefined}
                      className={`flex items-center gap-3 py-3 min-h-[44px] hover:bg-dusk/5 ${
                        row.isCurrent ? "border-l-4 border-ember pl-3" : ""
                      }`}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
