"use client";

import { useState, useId, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import { BLOCKED_EMAIL_MESSAGE } from "@/lib/auth/blockedMessage";
import { postWithRetry } from "@/lib/auth/postWithRetry";

// "sneak_peek": embedded on /sneak-peek under that page's own h1 -- creates
// an account for a new email and simply signs in an existing one, since
// either way the visitor just wants the sample.
// "claim": the same, embedded on /claim for someone who bought the printed
// book on Amazon and wants its digital edition.
type Mode = "login" | "signup" | "sneak_peek" | "claim";

export function AuthForm({
  mode,
  next,
}: {
  mode: Mode;
  next: string;
}) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [setupBlocked, setSetupBlocked] = useState(false);
  const emailId = useId();
  const codeId = useId();
  const codeHeadingRef = useRef<HTMLHeadingElement>(null);

  const isSignup = mode === "signup";
  const isSneakPeek = mode === "sneak_peek";
  const isClaim = mode === "claim";
  const isEmbedded = isSneakPeek || isClaim;
  const canCreateAccount = mode !== "login";
  const Heading = isEmbedded ? "h2" : "h1";
  const formClass = isEmbedded ? "max-w-sm space-y-4" : "max-w-sm mx-auto px-4 py-16 sm:py-20 space-y-4";
  const title = isSneakPeek
    ? "Get your free sample"
    : isClaim
    ? "First, sign in or create your account"
    : isSignup
    ? "Create your account"
    : "Log in";

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // This is what actually distinguishes signup from login functionally,
        // not just the page copy: signup may create a brand-new account,
        // while login only ever signs in an account that already exists.
        shouldCreateUser: canCreateAccount,
      },
    });

    setLoading(false);

    if (authError) {
      // REAL BUG FOUND (2026-11-08, hit live right after this flow shipped):
      // this used to treat *any* login error as "no account exists" --
      // right, when shouldCreateUser is false and the email genuinely has no
      // account, Supabase returns error_code "otp_disabled". But testing
      // this same flow heavily in one sitting tripped Supabase's own OTP
      // send rate limit (error_code "over_email_send_rate_limit", a 429),
      // which this code was showing as "we couldn't find an account for
      // that email" -- actively misleading for a real, existing account,
      // and exactly the kind of error that could make someone think they
      // need to sign up again. Now only the specific "no account" error
      // code gets that message; anything else (rate limit included) shows
      // Supabase's own real message instead.
      if (!canCreateAccount && authError.code === "otp_disabled") {
        setError("no_account");
      } else if (authError.code === "user_banned") {
        // A blocked email (/admin/users): its Supabase account is banned.
        setError(BLOCKED_EMAIL_MESSAGE);
      } else {
        setError(authError.message);
      }
      return;
    }

    setStep("code");
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // A code is single-use: once it has verified, a retry (after the
    // recording step below failed) must skip straight to recording again.
    if (!verified) {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });

      if (authError) {
        setLoading(false);
        setError(authError.code === "user_banned" ? BLOCKED_EMAIL_MESSAGE : authError.message);
        return;
      }
      setVerified(true);
    }

    // verifyOtp runs in the browser, so the server never sees this sign-in
    // on its own -- this is what creates the account's own `users` row (and
    // its login event). Without it a new account can sign in but can't save
    // progress or answers. Retried quietly on a network failure or 5xx (see
    // postWithRetry): on a phone, the first POST after switching back from
    // the mail app can go out on a stale connection and fail.
    try {
      const res = await postWithRetry("/api/auth/login-recorded");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string; blocked?: boolean } | null;
        setLoading(false);
        // 403: a blocked email. The route ended the session; clear every
        // cookie copy too, and drop the retry, since retrying can't help.
        if (res.status === 403 && body?.blocked) {
          await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
          setSetupBlocked(true);
          setError(BLOCKED_EMAIL_MESSAGE);
          return;
        }
        // 409: the email belongs to a different `users` row -- retrying can't
        // fix that, so the retry button goes away and the message (from the
        // route) asks them to get in touch.
        if (res.status === 409) setSetupBlocked(true);
        setError(body?.error ?? "Signed in, but we couldn't finish setting up your account. Please try again.");
        return;
      }
    } catch {
      setLoading(false);
      setError("Signed in, but we couldn't reach the server. Check your connection and try again.");
      return;
    }

    // A full browser navigation (not router.push) so this goes through
    // proxy.ts's own marketing/app subdomain redirect -- `next` can be
    // an app-domain path (e.g. /library) while this page is served from the
    // marketing domain.
    window.location.href = next;
  }

  // Move focus to the code step's heading once it appears, since the email
  // form it replaces disappears from the DOM — without this, keyboard/screen
  // reader focus is left on a removed element (WCAG 2.4.3 Focus Order).
  useEffect(() => {
    if (step === "code") codeHeadingRef.current?.focus();
  }, [step]);

  if (step === "code") {
    return (
      <form
        onSubmit={handleCodeSubmit}
        className={formClass}
        aria-label="Enter your code"
      >
        <Heading ref={codeHeadingRef} tabIndex={-1} className="font-display font-bold text-2xl text-ink">
          Enter your code
        </Heading>
        <p className="text-sm text-moss">
          We sent a code to <span className="font-medium">{email}</span>.
        </p>

        {/* REAL BUG FOUND (2026-11-08, hit live immediately): this was
            hardcoded to exactly 6 digits, assuming Supabase's default OTP
            length -- the real project is configured to send 8-digit codes,
            so the field silently truncated every real code to 6 digits and
            verifyOtp always failed. Supabase's OTP length is a per-project
            setting (Authentication -> Providers -> Email), not a fixed
            constant, so this no longer assumes a specific length: a
            generous maxLength (comfortably above any length Supabase would
            realistically use) and "non-empty" is the only client-side
            check -- verifyOtp itself is the real validator either way. */}
        <label htmlFor={codeId} className="sr-only">Sign-in code</label>
        <input
          id={codeId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={12}
          required
          placeholder="Code"
          aria-invalid={!!error}
          aria-describedby={error ? `${codeId}-error` : undefined}
          className="w-full border rounded-lg p-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-ink"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 12));
            setError(null);
          }}
        />

        {error && (
          <p id={`${codeId}-error`} role="alert" className="text-sm text-error">
            {error}
          </p>
        )}

        {!setupBlocked && (
          <button
            type="submit"
            disabled={loading || code.length === 0}
            className="w-full bg-ink text-white rounded-lg p-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
          >
            {loading ? "Verifying..." : verified ? "Try again" : "Verify"}
          </button>
        )}

        <p className="text-sm text-moss text-center">
          <button
            type="button"
            className="underline font-medium focus:outline-none focus:ring-2 focus:ring-ink rounded"
            onClick={() => {
              setStep("email");
              setCode("");
              setVerified(false);
              setSetupBlocked(false);
              setError(null);
            }}
          >
            Use a different email
          </button>
        </p>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleEmailSubmit}
      className={formClass}
      aria-label={isSignup ? "Sign up" : title}
    >
      <Heading className="font-display font-bold text-2xl text-ink">{title}</Heading>
      {isSignup && (
        <p className="text-sm text-moss">
          First time buying a study or book? Start here — we&apos;ll send a code to confirm your email.
        </p>
      )}
      {isClaim && (
        <p className="text-sm text-moss">
          Your digital edition lives in your account. Enter your email and we&apos;ll send a code to confirm it;
          new here, and we&apos;ll set up your account at the same time.
        </p>
      )}
      {isSneakPeek && (
        <p className="text-sm text-moss">
          Enter your email and we&apos;ll send a code to confirm it. Signing up also means we&apos;ll email
          you when the full launch is live.
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
        className="w-full border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-ink"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setError(null);
        }}
      />

      {error === "no_account" && (
        <p id={`${emailId}-error`} role="alert" className="text-sm text-error">
          We couldn&apos;t find an account for that email.{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="underline font-medium">
            Sign up instead
          </Link>
          .
        </p>
      )}
      {error && error !== "no_account" && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-ink text-white rounded-lg p-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
      >
        {loading ? "Sending..." : isEmbedded ? "Send my code" : isSignup ? "Sign up" : "Send code"}
      </button>

      {/* No login/signup cross-link on the embedded forms: they already work
          for both new and existing emails. */}
      {!isEmbedded && <p className="text-sm text-moss text-center">
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
      </p>}
    </form>
  );
}
