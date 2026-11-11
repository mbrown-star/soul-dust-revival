"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type JourneyInfo = { id: string; slug: string; title: string; published: boolean; readerHref: string; enrolled: number };

/**
 * On a bundle's edit page: read its Parts as one year-long Journey (see
 * journeys in lib/db/schema.ts). The Parts are the bundle's own components,
 * in its own order. Off (unpublished), readers see the Parts as ordinary
 * separate studies.
 */
export function JourneyPanel({
  bundleProductId,
  bundleTitle,
  bundleSlug,
  journey,
}: {
  bundleProductId: string;
  bundleTitle: string;
  bundleSlug: string;
  journey: JourneyInfo | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "PATCH" | "DELETE", body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/journeys", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(json?.message ?? "Couldn't save — please try again.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="journey-panel-heading" className="border border-dusk/15 rounded-lg p-5 space-y-3">
      <h2 id="journey-panel-heading" className="font-display font-bold text-lg text-ink">
        Present as a Journey
      </h2>
      <p className="text-sm text-moss">
        Readers who own every Part take them as one road: in this bundle&apos;s order, one week opening each week on
        their own Journey day, with a threshold at the start of each Part. My Library shows one card instead of one per
        Part.
      </p>
      {!journey ? (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            send("POST", {
              bundleProductId,
              title: bundleTitle.replace(/^soul dust revival:?\s*/i, "") || bundleTitle,
              slug: bundleSlug.replace(/^soul-dust-revival-/, "") || bundleSlug,
            })
          }
        >
          {busy ? "Saving…" : "Set up as a Journey"}
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <span className="font-semibold">{journey.title}</span> ·{" "}
            <a href={journey.readerHref} className="underline underline-offset-2 text-moss hover:text-ink">
              {journey.readerHref}
            </a>{" "}
            · {journey.enrolled} {journey.enrolled === 1 ? "reader has" : "readers have"} begun
          </p>
          <label className="flex items-center gap-2 text-sm text-ink min-h-[44px]">
            <input
              type="checkbox"
              checked={journey.published}
              disabled={busy}
              onChange={(e) => send("PATCH", { id: journey.id, published: e.target.checked })}
            />
            Published (readers see it as a Journey)
          </label>
          {journey.enrolled === 0 && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => send("DELETE", { id: journey.id })}>
              Remove Journey
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </section>
  );
}
