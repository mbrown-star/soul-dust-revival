"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { StudyWeekContent, StudyStation } from "@/lib/study/studyContent";

// REAL FIX (qa/findings/FINDINGS_2026-11-07.md #8): before this, a Study-
// kind lesson's full structured content (everything the 5-tab Study reader
// renders -- key verse, sections/parts, the whole passage, Work the Word
// stations, practices, the prayer, benediction) could only ever be created
// or corrected by running a one-off backfill script against the database
// directly. This is the first, and only, UI path to edit any of it.
//
// Deliberately a single big form over a wizard or per-tab editor: an admin
// correcting one real week's content needs to see and adjust it as a whole,
// the same way the reader itself presents it as one week, not navigate
// between several separate screens for one edit. <details> elements (native,
// no extra state) keep the page's total height manageable without a custom
// accordion component.

type SaveState = "idle" | "saving" | "saved" | "error";

export function StudyContentEditor({
  lessonId,
  initialContent,
}: {
  lessonId: string;
  initialContent: StudyWeekContent;
}) {
  const router = useRouter();
  const [content, setContent] = useState<StudyWeekContent>(initialContent);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof StudyWeekContent>(key: K, value: StudyWeekContent[K]) {
    setContent((c) => ({ ...c, [key]: value }));
    setSaveState("idle");
  }

  async function handleSave() {
    setSaveState("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lessonId, studyContent: content }),
      });
      const data = (await res.json()) as {
        studyContent?: StudyWeekContent;
        error?: string;
        details?: { fieldErrors?: Record<string, string[]> };
      };
      if (!res.ok) {
        // Found in review: this previously always threw a bare "Save
        // failed" that the catch below replaced with a hardcoded "check
        // your connection" message regardless of cause -- actively
        // misleading for a validation error (e.g. a required field left
        // blank), which gave the admin zero indication of what to fix.
        const fieldError = Object.values(data.details?.fieldErrors ?? {})[0]?.[0];
        throw new Error(fieldError ?? (data.error === "invalid_input" ? "Check the fields above and try again." : "Save failed"));
      }
      // A newly-added station gets a real questionBlockId back from the
      // server -- without syncing it into state, saving again before a
      // reload would try to create a second content_blocks row for the
      // same station instead of updating the first one.
      if (data.studyContent) setContent(data.studyContent);
      setSaveState("saved");
      // Keeps the page's own server-rendered bits (e.g. whether the plain
      // content-block editor below also shows, per
      // app/admin/studies/[id]/lessons/[lessonId]/page.tsx) in sync without
      // a manual reload -- most relevant the first time content is created
      // from the empty-state gate.
      router.refresh();
    } catch (err) {
      setSaveState("error");
      setError(err instanceof Error ? err.message : "Couldn't save. Check your connection and try again.");
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Field label="Subtitle" value={content.subtitle} onChange={(v) => update("subtitle", v)} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Key verse" value={content.keyVerse} onChange={(v) => update("keyVerse", v)} textarea />
        <Field label="Key verse reference" value={content.keyRef} onChange={(v) => update("keyRef", v)} />
      </div>

      <Section title="Study tab — Sections">
        <ObjectListEditor
          items={content.study.sections}
          onChange={(sections) => update("study", { ...content.study, sections })}
          newItem={(): StudyWeekContent["study"]["sections"][number] => ({ heading: "", paras: [""] })}
          renderItem={(section, onEdit) => (
            <>
              <Field label="Heading" value={section.heading} onChange={(v) => onEdit({ ...section, heading: v })} />
              <StringListEditor
                label="Paragraphs"
                items={section.paras}
                onChange={(paras) => onEdit({ ...section, paras })}
                textarea
              />
              <StringListEditor
                label="Pull quotes (optional)"
                items={section.pulls ?? []}
                onChange={(pulls) => onEdit({ ...section, pulls: pulls.length ? pulls : undefined })}
              />
            </>
          )}
          addLabel="Add section"
        />
      </Section>

      <Section title="Study tab — Four Parts">
        <ObjectListEditor
          items={content.study.parts}
          onChange={(parts) => update("study", { ...content.study, parts })}
          newItem={(): StudyWeekContent["study"]["parts"][number] => ({
            label: `Part ${content.study.parts.length + 1}`,
            heading: "",
            paras: [""],
          })}
          renderItem={(part, onEdit) => (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Label" value={part.label} onChange={(v) => onEdit({ ...part, label: v })} />
                <Field label="Heading" value={part.heading} onChange={(v) => onEdit({ ...part, heading: v })} />
              </div>
              <StringListEditor label="Paragraphs" items={part.paras} onChange={(paras) => onEdit({ ...part, paras })} textarea />
              <StringListEditor
                label="Pull quotes (optional)"
                items={part.pulls ?? []}
                onChange={(pulls) => onEdit({ ...part, pulls: pulls.length ? pulls : undefined })}
              />
            </>
          )}
          addLabel="Add part"
        />
      </Section>

      <Section title="Passage tab">
        <Field label="Passage reference (e.g. Colossians 1:1–14)" value={content.passageRef} onChange={(v) => update("passageRef", v)} />
        <ObjectListEditor
          items={content.passage}
          onChange={(passage) => update("passage", passage)}
          newItem={() => ({ c: content.passage.at(-1)?.c ?? 1, n: (content.passage.at(-1)?.n ?? 0) + 1, text: "" })}
          renderItem={(verse, onEdit) => (
            <div className="grid grid-cols-[5rem_5rem_1fr] gap-3 items-start">
              <NumberField label="Ch." value={verse.c} onChange={(v) => onEdit({ ...verse, c: v })} />
              <NumberField label="Verse" value={verse.n} onChange={(v) => onEdit({ ...verse, n: v })} />
              <Field label="Text" value={verse.text} onChange={(v) => onEdit({ ...verse, text: v })} />
            </div>
          )}
          addLabel="Add verse"
          compact
        />
      </Section>

      <Section title="Work the Word — Stations">
        <Field label="Stations label" value={content.stationsLabel} onChange={(v) => update("stationsLabel", v)} />
        <Field label="Stations intro" value={content.stationsIntro} onChange={(v) => update("stationsIntro", v)} textarea />
        <ObjectListEditor
          items={content.stations}
          onChange={(stations) => update("stations", stations)}
          newItem={(): StudyStation => ({
            ref: "",
            verse: "",
            question: "",
            questionBlockId: "", // filled in with a real id by the server on save
            greek: "",
            translit: "",
            gloss: "",
            xref: "",
            body: [""],
            live: "",
            verseNums: [],
            anchor: null,
          })}
          renderItem={(station, onEdit) => <StationEditor station={station} onChange={onEdit} />}
          addLabel="Add station"
          itemLabel={(s, i) => `Station ${i + 1}${s.ref ? ` — ${s.ref}` : ""}${s.greek ? ` (${s.greek})` : ""}`}
        />
      </Section>

      <Section title="Live It tab">
        <Field label="Life application title" value={content.lifeTitle} onChange={(v) => update("lifeTitle", v)} />
        <Field label="Life application intro" value={content.lifeIntro} onChange={(v) => update("lifeIntro", v)} textarea />
        <ObjectListEditor
          items={content.practices}
          onChange={(practices) => update("practices", practices)}
          newItem={() => ({ n: content.practices.length + 1, title: "", body: "" })}
          renderItem={(practice, onEdit) => (
            <>
              <Field label="Title" value={practice.title} onChange={(v) => onEdit({ ...practice, title: v })} />
              <Field label="Body" value={practice.body} onChange={(v) => onEdit({ ...practice, body: v })} textarea />
            </>
          )}
          addLabel="Add practice"
          itemLabel={(p) => `${p.n}. ${p.title || "Untitled practice"}`}
        />
        <Field label="Prayer lead-in" value={content.prayerLead} onChange={(v) => update("prayerLead", v)} textarea />
        <ObjectListEditor
          items={content.prayerBeats}
          onChange={(prayerBeats) => update("prayerBeats", prayerBeats)}
          newItem={() => ({ person: "Father" as const, verb: "", words: "" })}
          renderItem={(beat, onEdit) => (
            <div className="grid grid-cols-[8rem_1fr_1fr] gap-3 items-start">
              <SelectField
                label="Person"
                value={beat.person}
                options={["Father", "Son", "Spirit"]}
                onChange={(v) => onEdit({ ...beat, person: v as typeof beat.person })}
              />
              <Field label="Verb" value={beat.verb} onChange={(v) => onEdit({ ...beat, verb: v })} />
              <Field label="Words" value={beat.words} onChange={(v) => onEdit({ ...beat, words: v })} />
            </div>
          )}
          addLabel="Add prayer beat"
          compact
        />
        <Field label="Prayer close" value={content.prayerClose} onChange={(v) => update("prayerClose", v)} textarea />
        <StringListEditor label="Bottom Line" items={content.bottomLine} onChange={(v) => update("bottomLine", v)} textarea />
      </Section>

      <Section title="Lift Up tab">
        <StringListEditor label="Benediction" items={content.benediction} onChange={(v) => update("benediction", v)} textarea />
        <Field label="Closing verse" value={content.closingVerse} onChange={(v) => update("closingVerse", v)} textarea />
        <Field label="Closing verse reference" value={content.closingRef} onChange={(v) => update("closingRef", v)} />
        <Field label="Quiet question to carry" value={content.carry} onChange={(v) => update("carry", v)} textarea />
      </Section>

      <div className="flex items-center gap-3 pt-2 border-t border-moss/10">
        <Button onClick={handleSave} disabled={saveState === "saving"}>
          {saveState === "saving" ? "Saving..." : "Save study content"}
        </Button>
        {saveState === "saved" && (
          <p role="status" className="text-sm text-moss">
            Saved
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function StationEditor({ station, onChange }: { station: StudyStation; onChange: (s: StudyStation) => void }) {
  const anchorCheckboxId = useId();
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Verse reference (e.g. 1:2)" value={station.ref} onChange={(v) => onChange({ ...station, ref: v })} />
        <Field label="Cross-reference" value={station.xref} onChange={(v) => onChange({ ...station, xref: v })} />
      </div>
      <Field label="Verse text" value={station.verse} onChange={(v) => onChange({ ...station, verse: v })} textarea />
      <Field label="Question" value={station.question} onChange={(v) => onChange({ ...station, question: v })} textarea />
      <div className="grid grid-cols-3 gap-4">
        <Field label="Greek word" value={station.greek} onChange={(v) => onChange({ ...station, greek: v })} />
        <Field label="Transliteration" value={station.translit} onChange={(v) => onChange({ ...station, translit: v })} />
        <Field label="Gloss (short definition)" value={station.gloss} onChange={(v) => onChange({ ...station, gloss: v })} />
      </div>
      <StringListEditor label="Body paragraphs" items={station.body} onChange={(body) => onChange({ ...station, body })} textarea />
      <Field label="Live it line" value={station.live} onChange={(v) => onChange({ ...station, live: v })} textarea />
      <StringListEditor
        label="Verse numbers this station covers (e.g. 1:2)"
        items={station.verseNums}
        onChange={(verseNums) => onChange({ ...station, verseNums })}
      />
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={anchorCheckboxId}
          checked={station.anchor !== null}
          onChange={(e) => onChange({ ...station, anchor: e.target.checked ? { v: station.ref, word: station.greek } : null })}
        />
        <label htmlFor={anchorCheckboxId} className="text-sm">
          This word has an inline match in the passage text (uncheck if there&apos;s no clean English anchor for
          this Greek word — the Passage tab will show a fallback button instead)
        </label>
      </div>
      {station.anchor && (
        <div className="grid grid-cols-2 gap-4 pl-6">
          <Field
            label="Anchor verse (e.g. 1:2)"
            value={station.anchor.v}
            onChange={(v) => onChange({ ...station, anchor: { v, word: station.anchor!.word } })}
          />
          <Field
            label="Anchor word (as it appears in the passage text)"
            value={station.anchor.word}
            onChange={(word) => onChange({ ...station, anchor: { v: station.anchor!.v, word } })}
          />
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border border-moss/15 rounded-lg p-4" open>
      <summary className="font-display font-semibold text-ink cursor-pointer select-none">{title}</summary>
      <div className="space-y-4 mt-4">{children}</div>
    </details>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-moss uppercase tracking-wide">{label}</span>
      {textarea ? (
        <textarea
          className="w-full border border-moss/20 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="w-full border border-moss/20 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-moss uppercase tracking-wide">{label}</span>
      <input
        type="number"
        className="w-full border border-moss/20 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-moss uppercase tracking-wide">{label}</span>
      <select
        className="w-full border border-moss/20 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// A plain array of strings (paragraphs, body lines, benediction lines, ...).
function StringListEditor({
  label,
  items,
  onChange,
  textarea = false,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-moss uppercase tracking-wide">{label}</span>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1">
            {textarea ? (
              <textarea
                className="w-full border border-moss/20 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
                rows={2}
                value={item}
                onChange={(e) => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
              />
            ) : (
              <input
                className="w-full border border-moss/20 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
                value={item}
                onChange={(e) => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove item ${i + 1}`}
            className="text-error text-sm min-h-[40px] px-2"
          >
            Remove
          </button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => onChange([...items, ""])}>
        + Add
      </Button>
    </div>
  );
}

// A list of objects (sections, parts, passage verses, stations, practices,
// prayer beats) -- each rendered by the caller via renderItem, with shared
// add/remove/expand chrome.
function ObjectListEditor<T>({
  items,
  onChange,
  newItem,
  renderItem,
  addLabel,
  itemLabel,
  compact = false,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  newItem: () => T;
  renderItem: (item: T, onEdit: (next: T) => void) => React.ReactNode;
  addLabel: string;
  itemLabel?: (item: T, index: number) => string;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className={compact ? "flex gap-3 items-start border border-moss/10 rounded-lg p-3" : "border border-moss/10 rounded-lg p-4 space-y-3"}>
          <div className="flex-1 space-y-3">
            {itemLabel && <p className="text-xs font-semibold text-ember-700 uppercase tracking-wide">{itemLabel(item, i)}</p>}
            {renderItem(item, (next) => onChange(items.map((it, j) => (j === i ? next : it))))}
          </div>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-error text-sm min-h-[40px] px-2 shrink-0"
          >
            Remove
          </button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onClick={() => onChange([...items, newItem()])}>
        {addLabel}
      </Button>
    </div>
  );
}
