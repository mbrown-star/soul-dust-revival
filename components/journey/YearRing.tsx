const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** How much of the Journey's year is walked: "17 of 52 weeks". */
export function YearRing({ done, total }: { done: number; total: number }) {
  const fraction = total === 0 ? 0 : done / total;
  return (
    <div className="relative w-28 h-28 shrink-0" role="img" aria-label={`${done} of ${total} weeks walked`}>
      <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={RADIUS} fill="none" strokeWidth="6" className="stroke-parchment/15" />
        <circle
          cx="40"
          cy="40"
          r={RADIUS}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          className="stroke-gold"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-bold text-2xl tabular-nums">{done}</span>
        <span className="font-sans text-[0.65rem] uppercase tracking-wide text-parchment/80">of {total} weeks</span>
      </span>
    </div>
  );
}
