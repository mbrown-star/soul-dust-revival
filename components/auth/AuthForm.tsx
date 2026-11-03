"use client";

import { useState, useId, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

type Mode = "login" | "signup";

export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailId = useId();
  const confirmationRef = useRef<HTMLParagraphElement>(null);

  const isSignup = mode === "signup";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // This is what actually distinguishes signup from login functionally,
        // not just the page copy: signup may create a brand-new account,
        // while login only ever signs in an account that already exists.
        shouldCreateUser: isSignup,
      },
    });

    setLoading(false);

    if (authError) {
      // Supabase returns an error here (rather than silently succeeding)
      // when shouldCreateUser is false and no account exists for that email.
      if (!isSignup) {
        setError("no_account");
      } else {
        setError(authError.message);
      }
      return;
    }

    setSent(true);
  }

  // Move focus to the confirmation message once it appears, since the form
  // it replaces disappears from the DOM — without this, keyboard/screen
  // reader focus is left on a removed element (WCAG 2.4.3 Focus Order).
  useEffect(() => {
    if (sent) confirmationRef.current?.focus();
  }, [sent]);

  if (sent) {
    return (
      <div className="max-w-sm mx-auto px-4 py-16 sm:py-20 text-center">
        <p ref={confirmationRef} tabIndex={-1} role="status">
          {isSignup
            ? "Check your email to confirm your account and finish signing up."
            : "Check your email for a login link."}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-sm mx-auto px-4 py-16 sm:py-20 space-y-4"
      aria-label={isSignup ? "Sign up" : "Log in"}
    >
      <h1 className="text-xl font-semibold">{isSignup ? "Create your account" : "Log in"}</h1>
      {isSignup && (
        <p className="text-sm text-neutral-600">
          First time buying a study or book? Start here — we&apos;ll send a link to confirm your email.
        </p>
      )}

      <label htmlFor={emailId} className="sr-only">Email address</label>
      <input
        id={emailId}
        type="email"
        required
        placeholder="you@example.com"
        aria-invalid={!!error}
        aria-describedby={error ? `${emailId}-error` : undefined}
        className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-900"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
        }}
      />

      {error === "no_account" && (
        <p id={`${emailId}-error`} role="alert" className="text-sm text-red-600">
          We couldn&apos;t find an account for that email.{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="underline font-medium">
            Sign up instead
          </Link>
          .
        </p>
      )}
      {error && error !== "no_account" && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-neutral-900 text-white rounded-lg p-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900"
      >
        {loading ? "Sending..." : isSignup ? "Sign up" : "Send login link"}
      </button>

      <p className="text-sm text-neutral-600 text-center">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline font-medium">
              Log in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="underline font-medium">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
