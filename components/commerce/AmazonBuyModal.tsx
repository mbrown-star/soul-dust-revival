"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { keepTabInside } from "@/lib/ui/focusTrap";

const buttonClass =
  "inline-block font-sans font-semibold bg-ink text-parchment rounded-lg px-6 py-3 hover:bg-dusk focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink";

// A plain shape check so an obvious typo is caught before going to Amazon;
// the server validates properly.
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/**
 * "Buy on Amazon" for a printed book that comes with its digital edition.
 * Amazon never tells us who bought, so the buyer unlocks the digital edition
 * on /claim with their order number. This explains that before they go, and
 * offers to email them the claim link, then sends them to Amazon in a new
 * tab. The Amazon link is a real link (so a popup blocker never stops it);
 * the email request goes out in the same click.
 */
export function AmazonBuyModal({
  amazonUrl,
  productId,
  productSlug,
  productTitle,
  signedInEmail,
}: {
  amazonUrl: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  signedInEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(signedInEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [failMessage, setFailMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const emailId = useId();
  const errorId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setState("idle");
    setError(null);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      // Keep Tab inside the dialog while it's open.
      keepTabInside(e, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  function emailAndGo(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!looksLikeEmail(email)) {
      e.preventDefault();
      setError("Please enter a valid email address, or continue without one below.");
      emailRef.current?.focus();
      return;
    }
    setError(null);
    setState("sending");
    // The link opens Amazon in a new tab; this tab stays to say how it went.
    fetch("/api/amazon-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, email: email.trim() }),
      keepalive: true,
    })
      .then(async (res) => {
        if (res.ok) return setState("sent");
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setFailMessage(body?.message ?? "We couldn't send the email just now.");
        setState("failed");
      })
      .catch(() => {
        setFailMessage("We couldn't send the email just now.");
        setState("failed");
      });
  }

  const claimHref = `/claim?product=${encodeURIComponent(productSlug)}`;

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={buttonClass} aria-haspopup="dialog">
        Buy on Amazon
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-ink/50" tabIndex={-1} />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4 font-sans text-ink"
          >
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center text-moss text-lg"
            >
              ✕
            </button>
            <h2 id={titleId} className="font-display font-bold text-xl pr-8">
              Your book comes with its digital edition
            </h2>

            {state === "sent" || state === "failed" ? (
              <div role="status" className="space-y-3">
                {state === "sent" ? (
                  <p>
                    We&apos;ve emailed the link to <strong>{email.trim()}</strong>. Amazon opened in a new tab. Once your
                    order arrives, open that email to unlock the digital edition.
                  </p>
                ) : (
                  <p>
                    {failMessage} Amazon opened in a new tab. Once your order arrives, go to{" "}
                    <Link href={claimHref} className="underline font-semibold">
                      souldustrevival.com/claim
                    </Link>{" "}
                    to unlock the digital edition.
                  </p>
                )}
                <button type="button" onClick={close} className={buttonClass}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm">
                  Buying <strong>{productTitle}</strong> on Amazon also gives you its digital edition in the Soul Dust
                  Revival app. Amazon doesn&apos;t tell us who bought, so once your order arrives you&apos;ll unlock it
                  with your Amazon order number.
                </p>
                <div className="space-y-1">
                  <label htmlFor={emailId} className="block text-sm font-semibold">
                    Email
                  </label>
                  <input
                    ref={emailRef}
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ink"
                  />
                  <p className="text-xs text-moss">
                    We&apos;ll email you the link to unlock it. Use this address to sign in to the app.
                  </p>
                  {error && (
                    <p id={errorId} role="alert" className="text-sm text-error">
                      {error}
                    </p>
                  )}
                </div>
                <a
                  href={amazonUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={emailAndGo}
                  aria-disabled={state === "sending" || undefined}
                  className={`${buttonClass} w-full text-center`}
                >
                  Email me the link and continue to Amazon
                </a>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <a
                    href={amazonUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    className="underline text-moss hover:text-ink"
                  >
                    Continue to Amazon without the email
                  </a>
                  <Link href={claimHref} className="underline text-moss hover:text-ink">
                    Already ordered? Claim it now
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
