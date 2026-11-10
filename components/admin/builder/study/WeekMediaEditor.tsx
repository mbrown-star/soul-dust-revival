"use client";

import { createContext, useContext, useId } from "react";
import { DEFAULT_CALLOUT_COLOR, type ContentBlockData } from "@/lib/content/blocks";
import type { WeekMedia } from "@/lib/study/studyContent";
import { issuesUnder, type StudyContentIssues } from "@/lib/study/studyContentIssues";
import { StatusPill } from "../BlockCard";
import { BLOCK_DEFINITION_BY_TYPE } from "../blockRegistry";
import { SortableList } from "../SortableList";

/**
 * Applies a patch to one media item (by id) against the week's *latest*
 * state. Uploads resolve after the admin may have kept typing, so they can't
 * use the list's own onChange, which closes over the state at render time.
 */
export const WeekMediaPatchContext = createContext<(id: string, patch: Partial<WeekMedia>) => void>(() => {});

const MEDIA_TYPES: WeekMedia["type"][] = ["image", "video", "audio", "callout"];

/** A copy of an item whose attached media all get new ids (ids must stay unique across the week). */
export function withFreshMediaIds<T extends { media?: WeekMedia[] }>(item: T): T {
  const copy = structuredClone(item);
  return copy.media ? { ...copy, media: copy.media.map((m) => ({ ...m, id: crypto.randomUUID() })) } : copy;
}

function toBlockData(media: WeekMedia): ContentBlockData {
  return {
    id: media.id,
    type: media.type,
    body: media.body ?? null,
    imageUrl: media.imageUrl ?? null,
    imageAlt: media.imageAlt ?? null,
    mediaId: media.mediaId ?? null,
    mediaUrl: media.mediaUrl ?? null,
    captionsUrl: media.captionsUrl ?? null,
    transcript: media.transcript ?? null,
    questionPrompt: null,
    calloutTitle: media.calloutTitle ?? null,
    calloutColor: media.calloutColor ?? null,
  };
}

/**
 * A reorderable list of images, videos, audio, and callouts attached to one
 * part of a week (a section, part, station, practice, or the end of a tab).
 * Each item opens the same editor the lesson block canvas uses.
 */
export function WeekMediaEditor({
  label,
  description,
  items,
  onChange,
  pathPrefix,
  issues,
  max = 10,
}: {
  label: string;
  description?: string;
  items: WeekMedia[];
  onChange: (next: WeekMedia[]) => void;
  pathPrefix: string;
  issues: StudyContentIssues;
  max?: number;
}) {
  const patchMedia = useContext(WeekMediaPatchContext);
  const labelId = useId();

  // A labelled group, so a screen reader announces which list a "+ Image"
  // button belongs to (a builder tab can hold many of these lists).
  return (
    <div role="group" aria-labelledby={labelId} className="space-y-2 border-t border-moss/10 pt-4">
      <div>
        <p id={labelId} className="text-xs font-medium text-moss uppercase tracking-wide">
          {label}
        </p>
        {description && <p className="text-xs text-moss">{description}</p>}
      </div>
      <SortableList<WeekMedia>
        items={items}
        onChange={onChange}
        max={max}
        canDuplicate
        duplicateItem={(m) => ({ ...structuredClone(m), id: crypto.randomUUID() })}
        itemIcon={(m) => BLOCK_DEFINITION_BY_TYPE[m.type].icon}
        itemTypeLabel={(m) => BLOCK_DEFINITION_BY_TYPE[m.type].label}
        itemLabel={(m, i) => `${BLOCK_DEFINITION_BY_TYPE[m.type].label.toLowerCase()} ${i + 1}`}
        summary={(m) => BLOCK_DEFINITION_BY_TYPE[m.type].summary(toBlockData(m))}
        itemStatus={(m, i) => {
          const errors = issuesUnder(issues, `${pathPrefix}.${i}.`);
          if (errors > 0) return <StatusPill tone="error">{errors} to fix</StatusPill>;
          const issue = BLOCK_DEFINITION_BY_TYPE[m.type].issue(toBlockData(m));
          return issue ? <StatusPill tone={issue === "Empty" ? "muted" : "error"}>{issue}</StatusPill> : undefined;
        }}
        addOptions={MEDIA_TYPES.map((type) => ({
          label: `+ ${BLOCK_DEFINITION_BY_TYPE[type].label}`,
          newItem: (): WeekMedia => ({
            id: crypto.randomUUID(),
            type,
            ...(type === "callout" ? { calloutColor: DEFAULT_CALLOUT_COLOR } : {}),
          }),
        }))}
        renderItem={(media) => {
          const Editor = BLOCK_DEFINITION_BY_TYPE[media.type].Editor;
          return <Editor block={toBlockData(media)} update={(patch) => patchMedia(media.id, patch as Partial<WeekMedia>)} />;
        }}
      />
    </div>
  );
}
