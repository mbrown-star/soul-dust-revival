import type { SubHeading } from "@/lib/study/studyContent";

/**
 * A section's paragraphs, with any small-capitals sub-headings the
 * manuscript prints between them (`heads[i].at` is the paragraph it comes
 * before; at === paras.length means after the last).
 */
export function ParasWithHeads({ paras, heads }: { paras: string[]; heads?: SubHeading[] }) {
  const before = (i: number) => (heads ?? []).filter((h) => h.at === i);
  return (
    <div className="prose max-w-none font-serif">
      {paras.map((p, j) => (
        <div key={j}>
          {before(j).map((h, k) => (
            <h3 key={k} className="font-sans text-xs font-semibold uppercase tracking-wide text-moss not-prose mt-6 mb-2">
              {h.text}
            </h3>
          ))}
          <p>{p}</p>
        </div>
      ))}
      {before(paras.length).map((h, k) => (
        <h3 key={k} className="font-sans text-xs font-semibold uppercase tracking-wide text-moss not-prose mt-6 mb-2">
          {h.text}
        </h3>
      ))}
    </div>
  );
}
