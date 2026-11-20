"use client";

import { useState, useId, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ALL_PLATFORMS, PLATFORM_LIMITS, PLATFORM_LABELS, SocialPlatform } from "@/lib/data/socialPlatforms";
import { UploadError, uploadFileToR2 } from "@/lib/r2/browserUpload";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/uploads/limits";
import { firstLocalRun, localTimeZoneLabel, localToday, toUtcSchedule } from "@/lib/social/localSchedule";

// The browser's own date and time zone. The server renders with neither, so
// these read as "" until hydration (no mismatch), then the real values.
const noSubscribe = () => () => {};
function useLocalToday(): string {
  return useSyncExternalStore(noSubscribe, () => localToday(), () => "");
}
function useTimeZoneLabel(): string {
  return useSyncExternalStore(noSubscribe, () => localTimeZoneLabel(), () => "");
}
// The current minute (0 on the server), so "has already passed" updates as time moves on.
const minuteTicker = (onChange: () => void) => {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
};
function useCurrentMinute(): number {
  return useSyncExternalStore(minuteTicker, () => Math.floor(Date.now() / 60_000) * 60_000, () => 0);
}

// Dates and times here are the admin's local ones; they're converted to UTC
// (what the server stores and fires on) only when the post is sent.
type TargetConfig = {
  frequency: "once" | "daily" | "weekly";
  dayOfWeek: number;
  timeOfDay: string;
  startDate: string; // "" means today
  endDate: string;
};

const defaultTargetConfig: TargetConfig = {
  frequency: "once",
  dayOfWeek: 1,
  timeOfDay: "09:00",
  startDate: "",
  endDate: "",
};

type PublishResult = { targetId: string; ok: boolean; error?: string };

export default function NewSocialPostPage() {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageAlt, setImageAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Record<SocialPlatform, boolean>>({
    x: false,
    facebook: false,
    instagram: false,
  });
  const [configs, setConfigs] = useState<Record<SocialPlatform, TargetConfig>>({
    x: { ...defaultTargetConfig },
    facebook: { ...defaultTargetConfig },
    instagram: { ...defaultTargetConfig },
  });
  const [customInstruction, setCustomInstruction] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [saving, setSaving] = useState<"schedule" | "now" | null>(null);
  const [publishFailures, setPublishFailures] = useState<string[]>([]);
  const today = useLocalToday();
  const timeZone = useTimeZoneLabel();
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const bodyId = useId();
  const altId = useId();
  const instructionId = useId();

  const activePlatforms = ALL_PLATFORMS.filter((p) => selected[p]);

  async function uploadImage(file: File) {
    setUploading(true);
    setImageError(null);
    try {
      setImageUrl(
        await uploadFileToR2({
          endpoint: "/api/admin/upload-url",
          request: { folder: "social" },
          file,
          contentType: file.type,
          maxBytes: IMAGE_UPLOAD_MAX_BYTES,
        })
      );
    } catch (err) {
      setImageError(err instanceof UploadError ? err.message : "Couldn't upload that image. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function getSuggestions() {
    if (activePlatforms.length === 0) {
      setError("Select at least one platform first, so suggestions fit its character limit.");
      return;
    }
    setSuggesting(true);
    setError(null);
    const res = await fetch("/api/admin/social/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms: activePlatforms, customInstruction: customInstruction || undefined }),
    });
    const data = (await res.json()) as { message?: string; drafts: string[] };
    if (!res.ok) {
      setError(data.message ?? "Couldn't get suggestions.");
      setSuggesting(false);
      return;
    }
    setDrafts(data.drafts);
    setSuggesting(false);
  }

  async function createPost(publishNow: boolean) {
    const targets = activePlatforms.map((platform) => {
      const c = configs[platform];
      if (publishNow) {
        // Saved as a one-off at this moment, then published straight away below.
        const now = new Date();
        return {
          platform,
          frequency: "once" as const,
          timeOfDay: now.toISOString().slice(11, 16),
          startDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString(),
        };
      }
      const utc = toUtcSchedule({
        frequency: c.frequency,
        dayOfWeek: c.frequency === "weekly" ? c.dayOfWeek : undefined,
        startDate: c.startDate || today,
        timeOfDay: c.timeOfDay,
        endDate: c.endDate || undefined,
      });
      return { platform, frequency: c.frequency, ...utc };
    });

    const res = await fetch("/api/admin/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        imageUrl,
        imageAlt: imageUrl ? imageAlt : undefined,
        sourceType: drafts.length > 0 ? "ai_suggested" : "manual",
        aiPrompt: customInstruction || undefined,
        targets,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      targets?: { id: string; platform: SocialPlatform }[];
    };
    if (!res.ok) throw new Error(data.message ?? "Couldn't save that post.");
    return data.targets ?? [];
  }

  async function handleSubmit(publishNow: boolean) {
    if (publishNow) {
      const names = activePlatforms.map((p) => PLATFORM_LABELS[p]).join(", ");
      if (!window.confirm(`Publish this post to ${names} right now?`)) return;
    }
    setSaving(publishNow ? "now" : "schedule");
    setError(null);
    setPublishFailures([]);

    try {
      const created = await createPost(publishNow);

      if (publishNow) {
        const res = await fetch("/api/admin/social/targets/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetIds: created.map((t) => t.id) }),
        });
        const data = (await res.json().catch(() => ({}))) as { results?: PublishResult[] };
        if (!res.ok || !data.results) throw new Error("The post was saved, but publishing didn't start. Try Publish now from the Social list.");
        const failures = data.results
          .filter((r) => !r.ok)
          .map((r) => {
            const platform = created.find((t) => t.id === r.targetId)?.platform;
            return `${platform ? PLATFORM_LABELS[platform] : "A platform"}: ${r.error ?? "failed"}`;
          });
        if (failures.length > 0) {
          setPublishFailures(failures);
          setSaving(null);
          return;
        }
      }

      router.push("/admin/social");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSaving(null);
    }
  }

  const canSubmit =
    body.length > 0 &&
    activePlatforms.length > 0 &&
    activePlatforms.every((p) => body.length <= PLATFORM_LIMITS[p]) &&
    !(selected.instagram && !imageUrl) &&
    !uploading;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">New social post</h1>

      {/* AI suggestions */}
      <div className="border rounded-lg p-4 bg-moss/5">
        <label htmlFor={instructionId} className="block text-sm font-medium mb-1">
          Ask Claude for draft ideas (optional)
        </label>
        <div className="flex gap-2">
          <input
            id={instructionId}
            className="flex-1 border rounded-lg p-2 text-sm"
            placeholder="e.g. announce the new Foundations study"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
          />
          <button
            onClick={getSuggestions}
            disabled={suggesting}
            className="bg-ink text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {suggesting ? "Thinking..." : "Get suggestions"}
          </button>
        </div>
        <p className="text-xs text-moss mt-1">
          Drafts promote only what&apos;s public now (the free sample and recent blog posts), and fit
          the character limit of whichever platforms are selected below.
        </p>
        {drafts.length > 0 && (
          <div className="space-y-2 mt-3">
            {drafts.map((draft, i) => (
              <button
                key={i}
                onClick={() => setBody(draft)}
                className="block w-full text-left border rounded-lg p-3 text-sm bg-white hover:border-moss"
              >
                {draft}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      <div>
        <label htmlFor={bodyId} className="block text-sm font-medium mb-1">Post text</label>
        <textarea
          id={bodyId}
          rows={5}
          className="w-full border rounded-lg p-3"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex gap-4 mt-1 text-xs">
          {ALL_PLATFORMS.map((p) => (
            <span key={p} className={body.length > PLATFORM_LIMITS[p] ? "text-error font-medium" : "text-moss"}>
              {PLATFORM_LABELS[p]}: {body.length}/{PLATFORM_LIMITS[p]}
            </span>
          ))}
        </div>
      </div>

      {/* Image */}
      <div>
        <span className="block text-sm font-medium mb-1">Image (optional — required for Instagram)</span>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="max-h-40 rounded mb-2" />
        )}
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
        <p role="status" aria-live="polite" className="text-sm text-moss h-5">{uploading ? "Uploading..." : ""}</p>
        {imageError && <p role="alert" className="text-sm text-error mt-1">{imageError}</p>}
        {imageUrl && (
          <div className="mt-2">
            <label htmlFor={altId} className="block text-sm font-medium mb-1">Alt text</label>
            <input id={altId} className="w-full border rounded-lg p-2 text-sm" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} />
          </div>
        )}
      </div>

      {/* Platforms + schedule */}
      <div className="space-y-4">
        <span className="block text-sm font-medium">Platforms &amp; schedule</span>
        {ALL_PLATFORMS.map((platform) => (
          <div key={platform} className="border rounded-lg p-4">
            <label className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={selected[platform]}
                onChange={(e) => setSelected((s) => ({ ...s, [platform]: e.target.checked }))}
              />
              <span className="font-medium">{PLATFORM_LABELS[platform]}</span>
            </label>

            {selected[platform] && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div>
                  <label className="block text-xs text-moss mb-1">Frequency</label>
                  <select
                    className="w-full border rounded-lg p-2 text-sm"
                    value={configs[platform].frequency}
                    onChange={(e) =>
                      setConfigs((c) => ({ ...c, [platform]: { ...c[platform], frequency: e.target.value as TargetConfig["frequency"] } }))
                    }
                  >
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                {configs[platform].frequency === "weekly" && (
                  <div>
                    <label className="block text-xs text-moss mb-1">Day of week</label>
                    <select
                      className="w-full border rounded-lg p-2 text-sm"
                      value={configs[platform].dayOfWeek}
                      onChange={(e) =>
                        setConfigs((c) => ({ ...c, [platform]: { ...c[platform], dayOfWeek: Number(e.target.value) } }))
                      }
                    >
                      {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => (
                        <option key={i} value={i}>{day}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-moss mb-1">Start date</label>
                  <input
                    type="date"
                    className="w-full border rounded-lg p-2 text-sm"
                    value={configs[platform].startDate || today}
                    onChange={(e) => setConfigs((c) => ({ ...c, [platform]: { ...c[platform], startDate: e.target.value } }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-moss mb-1">
                    Time{timeZone ? ` (${timeZone})` : ""}
                  </label>
                  <input
                    type="time"
                    className="w-full border rounded-lg p-2 text-sm"
                    value={configs[platform].timeOfDay}
                    onChange={(e) => setConfigs((c) => ({ ...c, [platform]: { ...c[platform], timeOfDay: e.target.value } }))}
                  />
                </div>
                {configs[platform].frequency !== "once" && (
                  <div>
                    <label className="block text-xs text-moss mb-1">End date (optional)</label>
                    <input
                      type="date"
                      className="w-full border rounded-lg p-2 text-sm"
                      value={configs[platform].endDate}
                      onChange={(e) => setConfigs((c) => ({ ...c, [platform]: { ...c[platform], endDate: e.target.value } }))}
                    />
                  </div>
                )}
              </div>
            )}
            {selected[platform] && today && <ScheduleHint config={configs[platform]} today={today} />}
            {selected[platform] && platform === "instagram" && !imageUrl && (
              <p className="text-xs text-error pl-6 mt-2">Instagram requires an image.</p>
            )}
          </div>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {publishFailures.length > 0 && (
        <div role="alert" className="text-sm text-error space-y-1">
          <p>The post was saved, but some platforms didn&apos;t publish:</p>
          <ul className="list-disc pl-5">
            {publishFailures.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p>
            Fix the cause, then use Publish now on the{" "}
            <a href="/admin/social" className="underline">
              Social list
            </a>
            .
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => handleSubmit(false)}
          disabled={!canSubmit || saving !== null}
          className="bg-ink text-white rounded-lg px-6 py-3 disabled:opacity-50"
        >
          {saving === "schedule" ? "Scheduling..." : "Schedule post"}
        </button>
        <button
          onClick={() => handleSubmit(true)}
          disabled={!canSubmit || saving !== null}
          className="border border-ink text-ink rounded-lg px-6 py-3 disabled:opacity-50"
        >
          {saving === "now" ? "Publishing..." : "Publish now"}
        </button>
      </div>
      <p className="text-xs text-moss">
        Publish now posts to the selected platforms immediately, once, and ignores the schedule above.
      </p>
    </div>
  );
}

function ScheduleHint({ config, today }: { config: TargetConfig; today: string }) {
  const nowMs = useCurrentMinute();
  const local = {
    frequency: config.frequency,
    dayOfWeek: config.frequency === "weekly" ? config.dayOfWeek : undefined,
    startDate: config.startDate || today,
    timeOfDay: config.timeOfDay,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(local.startDate) || !/^\d{2}:\d{2}$/.test(local.timeOfDay)) return null;
  const run = firstLocalRun(local);
  const when = run.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const utc = toUtcSchedule(local).timeOfDay;
  const past = run.getTime() < nowMs;
  return (
    <p className={`text-xs pl-6 mt-2 ${past ? "text-error" : "text-moss"}`}>
      {past
        ? `${when} has already passed, so this goes out on the next run (within 10 minutes).`
        : `First goes out ${when} (${utc} UTC), within 10 minutes of that time.`}
      {config.frequency !== "once" && " Repeats at the same UTC time, so it shifts an hour at daylight-saving changes."}
    </p>
  );
}
