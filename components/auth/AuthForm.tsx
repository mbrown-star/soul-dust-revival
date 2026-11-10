"use client";

import { useState, useId, useRef, useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

// "sneak_peek": embedded on /sneak-peek under that page's own h1 -- creates
// an account for a new email and simply signs in an existing one, since
// either way the visitor just wants the sample.
type Mode = "login" | "signup" | "sneak_peek";

export function AuthForm({
  mode,
  next,
  initialError,
}: {
  mode: Mode;
  next: string;
  // Set when /auth/callback redirected back here because a magic-link code
  // failed to exchange (expired, or already consumed -- commonly by an email
  // client's own link-prefetching/security scanner, not the person's own
  // click). Shown once; typing in the email field below clears it like any
  // other error, since at that point the visitor is requesting a fresh link.
  //
  // REAL BUG FOUND (2026-11-08, reported live, traced against a real email):
  // this entire class of failure -- a clickable magic-link URL silently
  // consumed by Google Workspace's own link-prefetching/security scanning
  // before the person's real click -- turned out to be unfixable from the
  // callback route alone, since *every* fresh link came back already
  // `otp_expired`, confirmed on souldustrevival.com's real Google Workspace
  // mail hosting. The actual fix is this file: stop sending a clickable
  // link at all and send a numeric code instead, which has no URL for
  // anything to prefetch. `initialError`/`link_expired` is kept only so a
  // stale already-sent magic-link email (from before this change shipped,
  // or any leftover /auth/callback fallback) still shows a clear message
  // instead of a silent failure -- not the primary path anymore.
  // "account_setup": signed in, but the email already belongs to a different
  // `users` row (see lib/auth/recordLogin.ts) -- needs a person to fix, so
  // the message asks them to get in touch rather than to retry.
  initialError?: "link_expired" | "account_setup";
}) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [setupBlocked, setSetupBlocked] = useState(false);
  const emailId = useId();
  const codeId = useId();
  const codeHeadingRef = useRef<HTMLHeadingElement>(null);

  const isSignup = mode === "signup";
  const isSneakPeek = mode === "sneak_peek";
  const canCreateAccount = mode !== "login";
  const Heading = isSneakPeek ? "h2" : "h1";
  const formClass = isSneakPeek ? "max-w-sm space-y-4" : "max-w-sm mx-auto px-4 py-16 sm:py-20 space-y-4";

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
        setError(authError.message);
        return;
      }
      setVerified(true);
    }

    // verifyOtp runs in the browser, so /auth/callback never sees this
    // sign-in -- this is what creates the account's own `users` row (and its
    // login event). Without it a new account can sign in but can't save
    // progress or answers.
    try {
      const res = await fetch("/api/auth/login-recorded", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setLoading(false);
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
    // proxy.ts's own marketing/app subdomain redirect the same way
    // /auth/callback's server-side redirect already does -- `next` can be
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
      aria-label={isSneakPeek ? "Get your free sample" : isSignup ? "Sign up" : "Log in"}
    >
      <Heading className="font-display font-bold text-2xl text-ink">
        {isSneakPeek ? "Get your free sample" : isSignup ? "Create your account" : "Log in"}
      </Heading>
      {isSignup && (
        <p className="text-sm text-moss">
          First time buying a study or book? Start here — we&apos;ll send a code to confirm your email.
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
      {error === "link_expired" && (
        <p role="alert" className="text-sm text-error">
          That link expired or was already used. Enter your email below to get a new code.
        </p>
      )}
      {error === "account_setup" && (
        <p role="alert" className="text-sm text-error">
          You&apos;re signed in, but we couldn&apos;t finish setting up your account. Please contact us so we can
          fix it.
        </p>
      )}
      {error && error !== "no_account" && error !== "link_expired" && error !== "account_setup" && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-ink text-white rounded-lg p-3 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
      >
        {loading ? "Sending..." : isSneakPeek ? "Send my code" : isSignup ? "Sign up" : "Send code"}
      </button>

      {/* No login/signup cross-link on the sneak-peek form: it already works
          for both new and existing emails. */}
      {!isSneakPeek && <p className="text-sm text-moss text-center">
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
