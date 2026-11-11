"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ACCEPTED_SCREENSHOT_MIME_TYPES, screenshotLimitsMessage } from "@/lib/contact/screenshots";
import {
  CONTACT_SCREENSHOT_MAX_BYTES,
  CONTACT_SCREENSHOTS_MAX_COUNT,
  formatMegabytes,
} from "@/lib/uploads/limits";

const inputClass =
  "w-full border border-moss/30 rounded-lg p-3 font-sans text-ink bg-white focus:outline-none focus:ring-2 focus:ring-ink";
const labelClass = "block font-sans text-sm font-medium text-ink mb-1";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/**
 * The Contact page's form. Sends name, email, message and screenshots as one
 * multipart request to /api/contact, which emails them to the site's inbox.
 * Screenshot rules are checked here first only so the person gets a clear
 * message right away; the route enforces them.
 */
export function ContactForm({ initialName, initialEmail }: { initialName: string; initialEmail: string }) {
  const id = useId();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status.kind === "sent") sentHeadingRef.current?.focus();
  }, [status.kind]);

  function addScreenshots(list: FileList | null) {
    const picked = Array.from(list ?? []);
    // Clear the input so choosing the same file again (after removing it)
    // still fires a change event.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (picked.length === 0) return;

    const notImages = picked.filter((f) => !ACCEPTED_SCREENSHOT_MIME_TYPES.includes(f.type));
    if (notImages.length) {
      setScreenshotError("Screenshots must be PNG, JPEG, WebP or GIF images.");
      return;
    }
    const next = [...screenshots, ...picked];
    const problem = screenshotLimitsMessage(next);
    if (problem) {
      setScreenshotError(problem);
      return;
    }
    setScreenshotError(null);
    setScreenshots(next);
  }

  function removeScreenshot(index: number) {
    setScreenshots((current) => current.filter((_, i) => i !== index));
    setScreenshotError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "sending" });

    const body = new FormData();
    body.set("name", name);
    body.set("email", email);
    body.set("message", message);
    if (document.referrer) body.set("page", document.referrer);
    for (const file of screenshots) body.append("screenshots", file);

    try {
      const res = await fetch("/api/contact", { method: "POST", body });
      if (res.ok) {
        setStatus({ kind: "sent" });
        return;
      }
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      setStatus({
        kind: "error",
        message:
          res.status === 401
            ? "Your session has ended. Please log in again, then send your message."
            : json?.message ?? "Your message didn't send. Please try again.",
      });
    } catch {
      setStatus({ kind: "error", message: "Your message didn't send. Check your connection and try again." });
    }
  }

  function startOver() {
    setMessage("");
    setScreenshots([]);
    setScreenshotError(null);
    setStatus({ kind: "idle" });
  }

  if (status.kind === "sent") {
    return (
      <div className="max-w-2xl rounded-xl border border-moss/20 bg-white p-6" role="status">
        <h2 ref={sentHeadingRef} tabIndex={-1} className="font-display font-bold text-2xl text-ink mb-2 focus:outline-none">
          Thank you. Your message is on its way.
        </h2>
        <p className="font-sans text-moss mb-6">
          We read every message. If it needs an answer, we&apos;ll reply to {email}.
        </p>
        <Button variant="secondary" onClick={startOver}>
          Send another message
        </Button>
      </div>
    );
  }

  const sending = status.kind === "sending";
  const screenshotHintId = `${id}-screenshots-hint`;
  const screenshotErrorId = `${id}-screenshots-error`;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-name`} className={labelClass}>
            Name <span aria-hidden="true" className="text-error">*</span>
          </label>
          <input
            id={`${id}-name`}
            type="text"
            required
            maxLength={100}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={labelClass}>
            Email <span aria-hidden="true" className="text-error">*</span>
          </label>
          <input
            id={`${id}-email`}
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-message`} className={labelClass}>
          Comments, feedback, or the issue you found <span aria-hidden="true" className="text-error">*</span>
        </label>
        <textarea
          id={`${id}-message`}
          required
          maxLength={5000}
          rows={8}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputClass} font-serif`}
        />
        <p className="font-sans text-xs text-moss mt-1">
          For an issue, it helps to say what you were doing and what you expected to happen.
        </p>
      </div>

      <div>
        <label htmlFor={`${id}-screenshots`} className={labelClass}>
          Screenshots <span className="font-normal text-moss">(optional)</span>
        </label>
        <input
          ref={fileInputRef}
          id={`${id}-screenshots`}
          type="file"
          multiple
          accept={ACCEPTED_SCREENSHOT_MIME_TYPES.join(",")}
          disabled={sending || screenshots.length >= CONTACT_SCREENSHOTS_MAX_COUNT}
          onChange={(e) => addScreenshots(e.target.files)}
          aria-describedby={`${screenshotHintId}${screenshotError ? ` ${screenshotErrorId}` : ""}`}
          className="block w-full font-sans text-sm text-moss file:mr-4 file:rounded-lg file:border file:border-moss/20 file:bg-parchment file:px-4 file:py-2 file:font-medium file:text-ink hover:file:bg-white disabled:opacity-50"
        />
        <p id={screenshotHintId} className="font-sans text-xs text-moss mt-1">
          Up to {CONTACT_SCREENSHOTS_MAX_COUNT} images (PNG, JPEG, WebP or GIF), {formatMegabytes(CONTACT_SCREENSHOT_MAX_BYTES)} each.
        </p>
        {screenshotError && (
          <p id={screenshotErrorId} role="alert" className="font-sans text-sm text-error mt-2">
            {screenshotError}
          </p>
        )}
        {screenshots.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="Attached screenshots">
            {screenshots.map((file, i) => (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-moss/20 bg-white px-3 py-2 font-sans text-sm"
              >
                <span className="truncate text-ink">
                  {file.name} <span className="text-moss">· {formatMegabytes(file.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeScreenshot(i)}
                  disabled={sending}
                  aria-label={`Remove ${file.name}`}
                  className="shrink-0 min-h-[44px] px-2 text-moss underline hover:text-ink focus:outline-none focus:ring-2 focus:ring-ink rounded disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {status.kind === "error" && (
        <p role="alert" className="font-sans text-sm text-error">
          {status.message}
        </p>
      )}

      <Button type="submit" disabled={sending}>
        {sending ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
