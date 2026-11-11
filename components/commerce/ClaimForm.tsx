"use client";

import { useId, useRef, useState, useEffect } from "react";
import { AMAZON_ORDER_NUMBER_HINT } from "@/lib/commerce/amazonOrderHint";
import { appUrl } from "@/lib/domains";

type Title = { id: string; title: string };
type Done = { kind: "claimed" | "already_owned"; title: string };

/** /claim for a signed-in reader: choose the book, enter the Amazon order number. */
export function ClaimForm({
  titles,
  initialProductId,
  email,
}: {
  titles: Title[];
  initialProductId: string | null;
  email: string;
}) {
  const [productId, setProductId] = useState(initialProductId ?? (titles.length === 1 ? titles[0]!.id : ""));
  const [orderNumber, setOrderNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const titleId = useId();
  const orderId = useId();
  const hintId = useId();
  const errorId = useId();
  const doneRef = useRef<HTMLHeadingElement>(null);

  // The form disappears on success; move focus to what replaces it.
  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/amazon-claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, orderNumber }),
      });
      const data = (await res.json().catch(() => null)) as
        | { status?: "claimed" | "already_owned"; productTitle?: string; message?: string }
        | null;
      if (!res.ok || !data?.status) {
        setError(
          res.status === 401
            ? "Your sign-in has expired. Reload the page and sign in again."
            : data?.message ?? "Something went wrong. Please try again."
        );
        return;
      }
      setDone({ kind: data.status, title: data.productTitle ?? "Your book" });
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 ref={doneRef} tabIndex={-1} className="font-display font-bold text-2xl text-ink focus:outline-none">
          {done.kind === "claimed" ? "Your digital edition is unlocked" : "It's already in your library"}
        </h2>
        <p className="font-serif text-ink">
          {done.kind === "claimed"
            ? `${done.title} is now in your library, signed in as ${email}.`
            : `${done.title} is already part of your account, so there's nothing more to claim.`}
        </p>
        <a
          href={appUrl("/library")}
          className="inline-block font-sans font-semibold bg-ink text-parchment rounded-lg px-6 py-3 hover:bg-dusk focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
        >
          Open My Library
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5" aria-label="Claim your digital edition">
      <p className="font-sans text-sm text-moss">
        Claiming for <span className="font-medium text-ink">{email}</span>.
      </p>

      <div>
        <label htmlFor={titleId} className="block font-sans text-sm font-medium text-ink mb-1">
          Which book did you buy?
        </label>
        <select
          id={titleId}
          required
          className="w-full border border-moss/30 rounded-lg p-3 bg-white focus:outline-none focus:ring-2 focus:ring-ink"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setError(null);
          }}
        >
          <option value="" disabled>
            Choose your book
          </option>
          {titles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={orderId} className="block font-sans text-sm font-medium text-ink mb-1">
          Amazon order number
        </label>
        <input
          id={orderId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={40}
          placeholder="123-1234567-1234567"
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={!!error}
          className="w-full border border-moss/30 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
          value={orderNumber}
          onChange={(e) => {
            setOrderNumber(e.target.value);
            setError(null);
          }}
        />
        <p id={hintId} className="font-sans text-xs text-moss mt-1">
          {AMAZON_ORDER_NUMBER_HINT}
        </p>
      </div>

      {error && (
        <p id={errorId} role="alert" className="font-sans text-sm text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !productId || !orderNumber.trim()}
        className="font-sans font-semibold bg-ink text-parchment rounded-lg px-6 py-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
      >
        {loading ? "Unlocking..." : "Unlock my digital edition"}
      </button>
    </form>
  );
}
