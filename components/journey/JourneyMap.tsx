import Link from "next/link";
import type { JourneyPart, JourneyStop } from "@/lib/journey/load";
import { formatOpensOn, type StopState } from "@/lib/journey/schedule";
import { LockIcon } from "@/components/study/LockIcon";

// "Part Two — Formed and Sent" -> { eyebrow: "Part Two", name: "Formed and Sent" }
function splitPartLabel(label: string): { eyebrow: string; name: string } {
  const [eyebrow, ...rest] = label.split(/\s+[—–-]\s+/);
  return rest.length > 0 ? { eyebrow: eyebrow!, name: rest.join(" — ") } : { eyebrow: "", name: label };
}

function statusText(state: StopState | undefined, isAdminPreview: boolean): string {
  if (!state) return isAdminPreview ? "Preview" : "";
  switch (state.state) {
    case "completed":
      return "Done";
    case "open":
      return "This week";
    case "waiting":
      return `Opens ${formatOpensOn(state.opensOn)}`;
    case "ahead":
      return "After the weeks before it";
  }
}

/**
 * The whole Journey as a trail: each Part a region, each stop a marker,
 * with its state in words (never color alone). Done and open stops link to
 * the week; the rest show when they open.
 */
export function JourneyMap({
  parts,
  stops,
  states,
  isAdminPreview,
}: {
  parts: JourneyPart[];
  stops: JourneyStop[];
  states: StopState[];
  isAdminPreview: boolean;
}) {
  return (
    <div className="space-y-10">
      {parts.map((part) => {
        const { eyebrow, name } = splitPartLabel(part.label);
        const partStops = stops.filter((s) => s.partIndex === part.index);
        const done = partStops.filter((s) => states[s.index]?.state === "completed").length;
        return (
          <section key={part.studyId} aria-labelledby={`part-${part.index}`} className="space-y-4">
            <div className="rounded-xl bg-dusk text-parchment mottle px-5 py-5 sm:px-6">
              {eyebrow && <p className="font-sans text-xs font-semibold uppercase tracking-wide text-gold">{eyebrow}</p>}
              <h2 id={`part-${part.index}`} className="font-display font-bold text-2xl sm:text-3xl">
                {name}
              </h2>
              <p className="font-sans text-sm text-parchment/80 mt-1">
                {done} of {partStops.length} done
              </p>
            </div>
            <ol className="relative ml-5 border-l-2 border-dusk/15 space-y-1">
              {partStops.map((stop) => {
                const state = states[stop.index];
                const readable = isAdminPreview || state?.state === "completed" || state?.state === "open";
                const isOpen = state?.state === "open";
                const marker =
                  state?.state === "completed"
                    ? "bg-moss border-moss text-white"
                    : isOpen
                      ? "bg-parchment border-ember text-ember-700 ring-4 ring-ember/20"
                      : "bg-parchment border-dusk/20 text-moss";
                const body = (
                  <>
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[1.0625rem] top-3 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${marker}`}
                    >
                      {state?.state === "completed" ? "✓" : readable ? "•" : <LockIcon className="w-3.5 h-3.5" />}
                    </span>
                    <span className="block min-w-0">
                      <span className={`block font-sans font-semibold ${readable ? "text-ink" : "text-ink/60"}`}>
                        {stop.isThreshold ? `${stop.label}: Introduction` : stop.title}
                      </span>
                      <span className={`block font-sans text-xs ${isOpen ? "text-ember-700 font-semibold" : "text-moss"}`}>
                        {statusText(state, isAdminPreview)}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={stop.lessonId} className="relative pl-8">
                    {readable ? (
                      <Link
                        href={stop.href}
                        aria-current={isOpen ? "step" : undefined}
                        className="block py-3 min-h-[44px] rounded-lg hover:bg-dusk/5 px-2 -mx-2"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="py-3 min-h-[44px] px-2 -mx-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
