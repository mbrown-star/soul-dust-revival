import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/safeRedirect";
import { AuthForm } from "@/components/auth/AuthForm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // safeRedirectPath -- see login/page.tsx's matching comment on the
  // open-redirect this guards against and the separate infinite-loop fix.
  const nextHref = safeRedirectPath(next, "/library");

  // REAL FIX (qa/findings/FINDINGS_2026-11-07.md #7) -- see login/page.tsx's
  // matching comment, including why this only auto-redirects when `next` is
  // the plain default (avoiding a real infinite-redirect-loop risk).
  const session = await getSession();
  if (session && !next) redirect(nextHref);

  return <AuthForm mode="signup" next={nextHref} />;
}
