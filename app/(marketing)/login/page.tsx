import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/safeRedirect";
import { AuthForm } from "@/components/auth/AuthForm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // safeRedirectPath (not a plain `next ?? "/library"`) rejects an absolute
  // or protocol-relative value before it can ever reach redirect() below --
  // see lib/auth/safeRedirect.ts for the open-redirect this guards against.
  // The current `session && !next` gate below happens to only ever redirect
  // to the literal default anyway, but this stays correct even if that
  // condition changes later.
  const nextHref = safeRedirectPath(next, "/library");

  // REAL FIX (qa/findings/FINDINGS_2026-11-07.md #7): neither this page nor
  // /signup redirected an already-authenticated visitor -- they'd see the
  // login form again instead of being sent on to `next`. Reading
  // searchParams as a server prop instead of useSearchParams() also means
  // this no longer needs a Suspense boundary to build.
  //
  // Only auto-redirect when `next` is the plain default (/library, always
  // safe for any logged-in user to land on) -- an EXPLICIT `next` almost
  // always means some other page's own role/entitlement guard sent the
  // visitor here, and that target might require more than just being
  // logged in (e.g. admin). Blindly trusting it caused a real infinite
  // redirect loop during testing: a logged-in non-admin bounced to
  // /login?next=/admin/products by the admin guard would get redirected
  // straight back to /admin/products, which bounces them to /login again,
  // forever. Showing the form in that case is a harmless no-op (a genuinely
  // unauthenticated visitor sees exactly what they'd see today), never a
  // loop.
  const session = await getSession();
  if (session && !next) redirect(nextHref);

  return <AuthForm mode="login" next={nextHref} />;
}
