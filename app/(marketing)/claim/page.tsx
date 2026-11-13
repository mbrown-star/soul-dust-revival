import { getDb } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { claimableProducts } from "@/lib/commerce/digitalEdition";
import { AuthForm } from "@/components/auth/AuthForm";
import { ClaimForm } from "@/components/commerce/ClaimForm";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim your digital edition",
};

/**
 * A printed book bought on Amazon comes with its digital edition. Amazon
 * never tells us who bought it, so the reader signs in (or creates an account
 * with the same code step) and enters their Amazon order number here.
 * Open on the sneak-peek site too: Amazon sells the books either way.
 */
export default async function ClaimPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const { product: productSlug } = await searchParams;
  const db = await getDb();
  const [session, titles] = await Promise.all([getSession(), claimableProducts(db)]);
  // Only a slug we actually offer is carried through, so nothing typed in the
  // URL reaches the sign-in form's redirect.
  const preselected = titles.find((t) => t.slug === productSlug) ?? null;
  const next = preselected ? `/claim?product=${encodeURIComponent(preselected.slug)}` : "/claim";

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <p className="font-sans text-xs uppercase tracking-wide text-ember-700 mb-2">Bought the printed book on Amazon?</p>
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink mb-4">Claim your digital edition</h1>
      <p className="font-serif text-moss max-w-2xl mb-10">
        Every Soul Dust Revival printed book comes with its digital edition in the app: the passages, the word
        studies, and room to write your answers. {session ? "Choose" : "Sign in, choose"} your book, and enter the
        order number from your Amazon order.
      </p>

      {titles.length === 0 ? (
        <p className="font-serif text-ink">No printed books are on Amazon yet. Check back soon.</p>
      ) : session ? (
        <ClaimForm
          titles={titles.map((t) => ({ id: t.id, title: t.title }))}
          initialProductId={preselected?.id ?? null}
          email={session.email}
        />
      ) : (
        <AuthForm mode="claim" next={next} />
      )}
    </div>
  );
}
