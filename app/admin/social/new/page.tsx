"use client";

import { useState, useId } from "react";
import { useRouter } from "next/navigation";
import { ALL_PLATFORMS, PLATFORM_LIMITS, PLATFORM_LABELS, SocialPlatform } from "@/lib/data/socialPlatforms";
import { UploadError, uploadFileToR2 } from "@/lib/r2/browserUpload";
import { IMAGE_UPLOAD_MAX_BYTES } from "@/lib/uploads/limits";

type TargetConfig = {
  frequency: "once" | "daily" | "weekly";
  dayOfWeek: number;
  timeOfDay: string;
  startDate: string;
  endDate: string;
};

const defaultTargetConfig: TargetConfig = {
  frequency: "once",
  dayOfWeek: 1,
  timeOfDay: "09:00",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
};

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
  const [saving, setSaving] = useState(false);
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

  async function handleSubmit() {
    setSaving(true);
    setError(null);

    const targets = activePlatforms.map((platform) => {
      const c = configs[platform];
      return {
        platform,
        frequency: c.frequency,
        dayOfWeek: c.frequency === "weekly" ? c.dayOfWeek : undefined,
        timeOfDay: c.timeOfDay,
        startDate: new Date(c.startDate).toISOString(),
        endDate: c.endDate ? new Date(c.endDate).toISOString() : undefined,
      };
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
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "Couldn't schedule that post.");
      setSaving(false);
      return;
    }

    router.push("/admin/social");
    router.refresh();
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
          Drafts are grounded in your recent published studies and blog posts, and fit
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
                    value={configs[platform].startDate}
                    onChange={(e) => setConfigs((c) => ({ ...c, [platform]: { ...c[platform], startDate: e.target.value } }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-moss mb-1">Time (UTC)</label>
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
            {selected[platform] && platform === "instagram" && !imageUrl && (
              <p className="text-xs text-error pl-6 mt-2">Instagram requires an image.</p>
            )}
          </div>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit || saving}
        className="bg-ink text-white rounded-lg px-6 py-3 disabled:opacity-50"
      >
        {saving ? "Scheduling..." : "Schedule post"}
      </button>
    </div>
  );
}
