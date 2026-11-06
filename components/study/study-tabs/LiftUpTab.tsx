import type { StudyWeekContent } from "@/lib/study/studyContent";

export function LiftUpTab({ content }: { content: StudyWeekContent }) {
  return (
    <div className="space-y-6">
      <div className="bg-ink text-parchment rounded-xl p-6 space-y-3">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold">Benediction</p>
        {content.benediction.map((p, i) => (
          <p key={i} className="font-serif text-lg">
            {p}
          </p>
        ))}
      </div>

      <div className="bg-white border border-dusk/10 rounded-xl p-6">
        <p className="font-serif italic text-lg text-ink">{content.closingVerse}</p>
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mt-3">{content.closingRef}</p>
      </div>

      <div className="bg-ink text-parchment rounded-xl p-6">
        <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold mb-2">Quiet Question to Carry</p>
        <p className="font-serif italic text-lg">{content.carry}</p>
      </div>
    </div>
  );
}
