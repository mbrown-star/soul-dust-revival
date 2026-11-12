"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { StudyStation, StudyWeekContent } from "@/lib/study/studyContent";
import { issuesUnder, type StudyContentIssues } from "@/lib/study/studyContentIssues";
import { parsePassageText } from "@/lib/study/parsePassageText";
import { BlockIcon, type BlockIconName } from "../BlockIcon";
import { NumberField, SelectField, TextField, inputClass } from "../fields";
import { SortableList } from "../SortableList";
import { WeekMediaEditor, withFreshMediaIds } from "./WeekMediaEditor";
import type { WeekTabId } from "@/lib/study/studyContent";

export type PanelProps = {
  content: StudyWeekContent;
  change: (next: StudyWeekContent) => void;
  issues: StudyContentIssues;
};

type Section = StudyWeekContent["study"]["sections"][number];
type Part = StudyWeekContent["study"]["parts"][number];
type Practice = StudyWeekContent["practices"][number];
type PrayerBeat = StudyWeekContent["prayerBeats"][number];

// Mirrors studyWeekContentSchema's array caps, so "Add" stops before the
// server would reject the week.
const LANGUAGES = ["Greek", "Hebrew"] as const;
const MAX = { sections: 20, parts: 20, paras: 50, pulls: 20, stations: 20, body: 20, verseNums: 50, practices: 20, beats: 10, lines: 20, prayerLines: 40 };

function preview(text: string, length = 70) {
  const t = text.trim();
  return t.length > length ? `${t.slice(0, length)}…` : t;
}

/** A fixed (non-reorderable) group of fields, styled like a block card. */
function PinnedCard({ icon, title, description, children }: { icon: BlockIconName; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border border-moss/15 rounded-lg bg-white shadow-sm">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-moss/10">
        <span className="flex items-center justify-center w-8 h-8 rounded-md bg-parchment text-ember-700 border border-moss/10">
          <BlockIcon name={icon} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="text-xs text-moss">{description}</p>}
        </div>
      </header>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function ListHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {description && <p className="text-sm text-moss">{description}</p>}
    </div>
  );
}

/** A reorderable list of strings (paragraphs, pull quotes, lines). */
function LineList({
  label,
  items,
  onChange,
  max,
  multiline = true,
  pathPrefix,
  issues,
  addLabel,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  max: number;
  multiline?: boolean;
  pathPrefix: string;
  issues: StudyContentIssues;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-moss uppercase tracking-wide">{label}</p>
      <SortableList
        variant="compact"
        items={items}
        onChange={onChange}
        max={max}
        itemLabel={(_, i) => `${label.toLowerCase()} ${i + 1}`}
        newItem={() => ""}
        addLabel={addLabel}
        renderItem={(value, update, i) => (
          <TextField
            label={`${label} ${i + 1}`}
            value={value}
            onChange={update}
            multiline={multiline}
            rows={multiline ? 3 : 1}
            error={issues.byPath.get(`${pathPrefix}.${i}`)}
          />
        )}
      />
    </div>
  );
}

// ---------- Study tab ----------

function TextSectionFields({
  item,
  update,
  path,
  issues,
  withLabel,
}: {
  item: Section | Part;
  update: (next: Section | Part) => void;
  path: string;
  issues: StudyContentIssues;
  withLabel: boolean;
}) {
  return (
    <>
      <div className={withLabel ? "grid sm:grid-cols-[10rem_1fr] gap-4" : ""}>
        {withLabel && "label" in item && (
          <TextField label="Label" required value={item.label} onChange={(label) => update({ ...item, label })} error={issues.byPath.get(`${path}.label`)} />
        )}
        {/* A Part needs its heading; an opening section may have none. */}
        <TextField label="Heading" required={withLabel} value={item.heading} onChange={(heading) => update({ ...item, heading })} error={issues.byPath.get(`${path}.heading`)} />
      </div>
      <LineList
        label="Paragraph"
        items={item.paras}
        onChange={(paras) => update({ ...item, paras })}
        max={MAX.paras}
        pathPrefix={`${path}.paras`}
        issues={issues}
        addLabel="+ Add paragraph"
      />
      <LineList
        label="Pull quote"
        items={item.pulls ?? []}
        onChange={(pulls) => update({ ...item, pulls: pulls.length ? pulls : undefined })}
        max={MAX.pulls}
        pathPrefix={`${path}.pulls`}
        issues={issues}
        addLabel="+ Add pull quote"
      />
      <WeekMediaEditor
        label="Images, video, audio & callouts"
        description="Shown after this text, in this order."
        items={item.media ?? []}
        onChange={(media) => update({ ...item, media: media.length ? media : undefined })}
        pathPrefix={`${path}.media`}
        issues={issues}
      />
    </>
  );
}

/** "More for this tab": media shown at the end of a reader tab. */
function TabMediaEditor({ tab, content, change, issues }: PanelProps & { tab: WeekTabId }) {
  return (
    <section className="border border-dashed border-moss/30 rounded-lg p-4 bg-white/50">
      <WeekMediaEditor
        label="More for this tab"
        description="Images, video, audio, or callouts shown at the end of this tab, before its done button."
        items={content.tabMedia?.[tab] ?? []}
        onChange={(media) =>
          change({ ...content, tabMedia: { ...content.tabMedia, [tab]: media.length ? media : undefined } })
        }
        pathPrefix={`tabMedia.${tab}`}
        issues={issues}
        max={20}
      />
    </section>
  );
}

export function StudyPanel({ content, change, issues }: PanelProps) {
  const err = (path: string) => issues.byPath.get(path);
  const setStudy = (study: StudyWeekContent["study"]) => change({ ...content, study });
  return (
    <>
      <PinnedCard icon="passage" title="Week header" description="Shown at the top of the Study tab.">
        <TextField label="Subtitle" value={content.subtitle} onChange={(subtitle) => change({ ...content, subtitle })} error={err("subtitle")} />
        <div className="grid sm:grid-cols-[1fr_14rem] gap-4">
          <TextField label="Key verse" required multiline value={content.keyVerse} onChange={(keyVerse) => change({ ...content, keyVerse })} error={err("keyVerse")} />
          <TextField label="Key verse reference" required value={content.keyRef} onChange={(keyRef) => change({ ...content, keyRef })} error={err("keyRef")} placeholder="Colossians 1:6" />
        </div>
      </PinnedCard>

      <ListHeading title="Sections" description="The opening reading, before the four parts." />
      <SortableList<Section>
        items={content.study.sections}
        onChange={(sections) => setStudy({ ...content.study, sections })}
        icon="section"
        typeLabel="Section"
        max={MAX.sections}
        canDuplicate
        duplicateItem={withFreshMediaIds}
        itemLabel={(s, i) => `section ${i + 1}${s.heading ? ` (${s.heading})` : ""}`}
        summary={(s) => s.heading || preview(s.paras[0] ?? "")}
        errorCount={(i) => issuesUnder(issues, `study.sections.${i}.`)}
        newItem={() => ({ heading: "", paras: [""] })}
        addLabel="+ Add section"
        emptyText="No sections yet."
        renderItem={(item, update, i) => (
          <TextSectionFields item={item} update={(next) => update(next as Section)} path={`study.sections.${i}`} issues={issues} withLabel={false} />
        )}
      />

      <ListHeading title="Parts" description="The numbered parts of the Scripture study." />
      <SortableList<Part>
        items={content.study.parts}
        onChange={(parts) => setStudy({ ...content.study, parts })}
        icon="part"
        typeLabel="Part"
        max={MAX.parts}
        canDuplicate
        duplicateItem={withFreshMediaIds}
        itemLabel={(p, i) => `${p.label || `part ${i + 1}`}`}
        summary={(p) => [p.label, p.heading].filter(Boolean).join(" — ")}
        errorCount={(i) => issuesUnder(issues, `study.parts.${i}.`)}
        newItem={() => ({ label: `Part ${content.study.parts.length + 1}`, heading: "", paras: [""] })}
        addLabel="+ Add part"
        emptyText="No parts yet."
        renderItem={(item, update, i) => (
          <TextSectionFields item={item} update={(next) => update(next as Part)} path={`study.parts.${i}`} issues={issues} withLabel />
        )}
      />
      <TabMediaEditor tab="study" content={content} change={change} issues={issues} />
    </>
  );
}

// ---------- Passage tab ----------

export function PassagePanel({ content, change, issues }: PanelProps) {
  const pasteId = useId();
  const [pasted, setPasted] = useState("");
  const [startChapter, setStartChapter] = useState(content.passage[0]?.c ?? 1);
  const parsed = pasted.trim() ? parsePassageText(pasted, startChapter) : [];

  function applyPaste() {
    if (parsed.length === 0) return;
    if (content.passage.length > 0 && !window.confirm(`Replace the current ${content.passage.length} verses with these ${parsed.length}?`)) return;
    change({ ...content, passage: parsed.slice(0, 500) });
    setPasted("");
  }

  return (
    <>
      <PinnedCard icon="passage" title="Passage" description="The full text readers read and memorize from.">
        <TextField
          label="Passage reference"
          required
          value={content.passageRef}
          onChange={(passageRef) => change({ ...content, passageRef })}
          error={issues.byPath.get("passageRef")}
          placeholder="Colossians 1:1–14"
        />
      </PinnedCard>

      <PinnedCard icon="text" title="Paste the passage" description="One verse per line: “1:3 text” or “3 text”. Lines without a number join the verse above.">
        <div className="grid sm:grid-cols-[1fr_8rem] gap-4 items-start">
          <div>
            <label htmlFor={pasteId} className="block text-xs font-medium text-moss uppercase tracking-wide mb-1">
              Passage text
            </label>
            <textarea id={pasteId} rows={6} className={inputClass} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          </div>
          <NumberField label="Starting chapter" value={startChapter} onChange={(v) => setStartChapter(Math.max(1, v))} />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" disabled={parsed.length === 0} onClick={applyPaste}>
            {content.passage.length > 0 ? "Replace verses" : "Use these verses"}
          </Button>
          <span className="text-xs text-moss" aria-live="polite">
            {parsed.length > 0 ? `${parsed.length} verses found (${parsed[0]!.c}:${parsed[0]!.n}–${parsed.at(-1)!.c}:${parsed.at(-1)!.n})` : ""}
          </span>
        </div>
      </PinnedCard>

      <ListHeading title={`Verses (${content.passage.length})`} />
      <SortableList
        variant="compact"
        items={content.passage}
        onChange={(passage) => change({ ...content, passage })}
        max={500}
        itemLabel={(v) => `verse ${v.c}:${v.n}`}
        newItem={() => {
          const last = content.passage.at(-1);
          return { c: last?.c ?? 1, n: (last?.n ?? 0) + 1, text: "" };
        }}
        addLabel="+ Add verse"
        emptyText="No verses yet -- paste the passage above, or add verses one at a time."
        renderItem={(verse, update, i) => (
          <div className="grid grid-cols-[4.5rem_4.5rem_1fr] gap-2 items-start">
            <NumberField label="Ch." value={verse.c} onChange={(c) => update({ ...verse, c })} error={issues.byPath.get(`passage.${i}.c`)} />
            <NumberField label="Verse" value={verse.n} onChange={(n) => update({ ...verse, n })} error={issues.byPath.get(`passage.${i}.n`)} />
            <TextField label="Text" multiline rows={2} value={verse.text} onChange={(text) => update({ ...verse, text })} />
          </div>
        )}
      />
      <TabMediaEditor tab="passage" content={content} change={change} issues={issues} />
    </>
  );
}

// ---------- Work the Word tab ----------

function StationFields({ station, update, path, issues }: { station: StudyStation; update: (s: StudyStation) => void; path: string; issues: StudyContentIssues }) {
  const anchorId = useId();
  const err = (field: string) => issues.byPath.get(`${path}.${field}`);
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Verse reference" required value={station.ref} onChange={(ref) => update({ ...station, ref })} error={err("ref")} placeholder="1:2" />
        <TextField label="Cross-reference" value={station.xref} onChange={(xref) => update({ ...station, xref })} />
      </div>
      <TextField label="Verse text" required multiline value={station.verse} onChange={(verse) => update({ ...station, verse })} error={err("verse")} />
      <TextField
        label="Question"
        required
        multiline
        value={station.question}
        onChange={(question) => update({ ...station, question })}
        error={err("question")}
        hint="Readers answer this in their own words; answers are saved to their account."
      />
      <fieldset className="border border-moss/10 rounded-lg p-3 space-y-4">
        <legend className="text-xs font-semibold text-ember-700 uppercase tracking-wide px-1">
          Going deeper -- the {station.lang === "hebrew" ? "Hebrew" : "Greek"}
        </legend>
        <div className="grid sm:grid-cols-4 gap-4">
          <SelectField
            label="Language"
            value={station.lang === "hebrew" ? "Hebrew" : "Greek"}
            options={LANGUAGES}
            onChange={(language) => update({ ...station, lang: language === "Hebrew" ? "hebrew" : "greek" })}
          />
          <TextField label="Word" value={station.greek} onChange={(greek) => update({ ...station, greek })} />
          <TextField label="Transliteration" value={station.translit} onChange={(translit) => update({ ...station, translit })} />
          <TextField label="Gloss" value={station.gloss} onChange={(gloss) => update({ ...station, gloss })} />
        </div>
        <LineList label="Body paragraph" items={station.body} onChange={(body) => update({ ...station, body })} max={MAX.body} pathPrefix={`${path}.body`} issues={issues} addLabel="+ Add paragraph" />
        <TextField label="Live it line" multiline rows={2} value={station.live} onChange={(live) => update({ ...station, live })} />
      </fieldset>
      <LineList
        label="Verse number covered"
        items={station.verseNums}
        onChange={(verseNums) => update({ ...station, verseNums })}
        max={MAX.verseNums}
        multiline={false}
        pathPrefix={`${path}.verseNums`}
        issues={issues}
        addLabel="+ Add verse number"
      />
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id={anchorId}
          className="mt-1"
          checked={station.anchor !== null}
          onChange={(e) => update({ ...station, anchor: e.target.checked ? { v: station.ref, word: "" } : null })}
        />
        <label htmlFor={anchorId} className="text-sm">
          Underline this word in the Passage tab (uncheck if the Greek word has no clean English match -- readers get a separate button instead)
        </label>
      </div>
      {station.anchor && (
        <div className="grid sm:grid-cols-2 gap-4 sm:pl-6">
          <TextField label="Anchor verse" value={station.anchor.v} onChange={(v) => update({ ...station, anchor: { v, word: station.anchor?.word ?? "" } })} placeholder="1:2" />
          <TextField
            label="Anchor word (as it appears in the passage)"
            value={station.anchor.word}
            onChange={(word) => update({ ...station, anchor: { v: station.anchor?.v ?? "", word } })}
          />
        </div>
      )}
      <WeekMediaEditor
        label="Images, video, audio & callouts"
        description="Shown with this station, after its Greek study."
        items={station.media ?? []}
        onChange={(media) => update({ ...station, media: media.length ? media : undefined })}
        pathPrefix={`${path}.media`}
        issues={issues}
      />
    </>
  );
}

export function WorkTheWordPanel({ content, change, issues }: PanelProps) {
  return (
    <>
      <PinnedCard icon="station" title="Work the Word intro">
        <TextField label="Section label" value={content.stationsLabel} onChange={(stationsLabel) => change({ ...content, stationsLabel })} />
        <TextField label="Intro" multiline value={content.stationsIntro} onChange={(stationsIntro) => change({ ...content, stationsIntro })} />
      </PinnedCard>

      <ListHeading title="Stations" description="Readers step through these one at a time, in this order." />
      <SortableList<StudyStation>
        items={content.stations}
        onChange={(stations) => change({ ...content, stations })}
        icon="station"
        typeLabel="Station"
        max={MAX.stations}
        itemLabel={(s, i) => `station ${i + 1}${s.ref ? ` (${s.ref})` : ""}`}
        summary={(s, i) => `${i + 1}. ${[s.ref, s.greek].filter(Boolean).join(" · ")}${s.question ? ` — ${preview(s.question, 50)}` : ""}`}
        errorCount={(i) => issuesUnder(issues, `stations.${i}.`)}
        newItem={() => ({
          ref: "",
          verse: "",
          question: "",
          // Assigned here, not by the server, so a save still in flight can
          // never leave the builder and the server disagreeing about it; the
          // server creates the answer block under this id on first save.
          questionBlockId: crypto.randomUUID(),
          greek: "",
          translit: "",
          gloss: "",
          xref: "",
          body: [""],
          live: "",
          verseNums: [],
          anchor: null,
        })}
        addLabel="+ Add station"
        emptyText="No stations yet."
        renderItem={(station, update, i) => <StationFields station={station} update={update} path={`stations.${i}`} issues={issues} />}
      />
      <TabMediaEditor tab="work" content={content} change={change} issues={issues} />
    </>
  );
}

// ---------- Live It tab ----------

const PERSONS = ["Father", "Son", "Spirit"] as const;

export function LiveItPanel({ content, change, issues }: PanelProps) {
  return (
    <>
      <PinnedCard icon="practice" title="Life application intro">
        <TextField label="Title" value={content.lifeTitle} onChange={(lifeTitle) => change({ ...content, lifeTitle })} />
        <TextField label="Intro" multiline value={content.lifeIntro} onChange={(lifeIntro) => change({ ...content, lifeIntro })} />
      </PinnedCard>

      <ListHeading title="Practices" description="Numbered automatically in this order." />
      <SortableList<Practice>
        items={content.practices}
        onChange={(practices) => change({ ...content, practices: practices.map((p, i) => ({ ...p, n: i + 1 })) })}
        icon="practice"
        typeLabel="Practice"
        max={MAX.practices}
        canDuplicate
        duplicateItem={withFreshMediaIds}
        itemLabel={(p, i) => `practice ${i + 1}${p.title ? ` (${p.title})` : ""}`}
        summary={(p, i) => `${i + 1}. ${p.title || preview(p.body)}`}
        errorCount={(i) => issuesUnder(issues, `practices.${i}.`)}
        newItem={() => ({ n: content.practices.length + 1, title: "", body: "" })}
        addLabel="+ Add practice"
        emptyText="No practices yet."
        renderItem={(practice, update, i) => (
          <>
            <TextField label="Title" value={practice.title} onChange={(title) => update({ ...practice, title })} />
            <TextField label="Body" multiline value={practice.body} onChange={(body) => update({ ...practice, body })} />
            <WeekMediaEditor
              label="Images, video, audio & callouts"
              description="Shown after this practice."
              items={practice.media ?? []}
              onChange={(media) => update({ ...practice, media: media.length ? media : undefined })}
              pathPrefix={`practices.${i}.media`}
              issues={issues}
            />
          </>
        )}
      />

      <PinnedCard
        icon="prayer"
        title="Daily prayer"
        description="Lead-in, beats and close make the guided five-minute prayer timer. A week with no beats shows its prayer lines as printed."
      >
        <LineList
          label="Prayer line"
          items={content.prayerLines ?? []}
          onChange={(prayerLines) => change({ ...content, prayerLines: prayerLines.length ? prayerLines : undefined })}
          max={MAX.prayerLines}
          multiline={false}
          pathPrefix="prayerLines"
          issues={issues}
          addLabel="+ Add prayer line"
        />
        <TextField label="Lead-in" multiline rows={2} value={content.prayerLead} onChange={(prayerLead) => change({ ...content, prayerLead })} />
        <SortableList<PrayerBeat>
          variant="compact"
          items={content.prayerBeats}
          onChange={(prayerBeats) => change({ ...content, prayerBeats })}
          max={MAX.beats}
          itemLabel={(b, i) => `prayer beat ${i + 1} (${b.person})`}
          newItem={() => ({ person: PERSONS[content.prayerBeats.length % PERSONS.length]!, verb: "", words: "" })}
          addLabel="+ Add prayer beat"
          emptyText="No prayer beats yet."
          renderItem={(beat, update) => (
            <div className="grid sm:grid-cols-[7rem_9rem_1fr] gap-2 items-start">
              <SelectField label="Person" value={beat.person} options={PERSONS} onChange={(person) => update({ ...beat, person })} />
              <TextField label="Verb" value={beat.verb} onChange={(verb) => update({ ...beat, verb })} placeholder="Thank" />
              <TextField label="Words" multiline rows={2} value={beat.words} onChange={(words) => update({ ...beat, words })} />
            </div>
          )}
        />
        <TextField label="Close" multiline rows={2} value={content.prayerClose} onChange={(prayerClose) => change({ ...content, prayerClose })} />
      </PinnedCard>

      <PinnedCard icon="line" title="Bottom line">
        <LineList
          label="Line"
          items={content.bottomLine}
          onChange={(bottomLine) => change({ ...content, bottomLine })}
          max={MAX.lines}
          pathPrefix="bottomLine"
          issues={issues}
          addLabel="+ Add line"
        />
      </PinnedCard>
      <TabMediaEditor tab="live" content={content} change={change} issues={issues} />
    </>
  );
}

// ---------- Lift Up tab ----------

export function LiftUpPanel({ content, change, issues }: PanelProps) {
  return (
    <>
      <PinnedCard icon="prayer" title="Benediction">
        <LineList
          label="Benediction paragraph"
          items={content.benediction}
          onChange={(benediction) => change({ ...content, benediction })}
          max={MAX.lines}
          pathPrefix="benediction"
          issues={issues}
          addLabel="+ Add paragraph"
        />
      </PinnedCard>
      <PinnedCard icon="passage" title="Closing verse">
        <div className="grid sm:grid-cols-[1fr_14rem] gap-4">
          <TextField label="Closing verse" multiline value={content.closingVerse} onChange={(closingVerse) => change({ ...content, closingVerse })} />
          <TextField label="Reference" value={content.closingRef} onChange={(closingRef) => change({ ...content, closingRef })} />
        </div>
      </PinnedCard>
      <PinnedCard icon="question" title="Quiet question to carry" description="Shown on its own card at the end of the week.">
        <TextField label="Question" multiline rows={2} value={content.carry} onChange={(carry) => change({ ...content, carry })} />
      </PinnedCard>
      <TabMediaEditor tab="lift" content={content} change={change} issues={issues} />
    </>
  );
}
