import Link from "next/link";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { ContactForm } from "@/components/contact/ContactForm";
import { CONTACT_INBOX } from "@/lib/contact/inbox";

// Per-request render, for the nonce-based CSP (proxy.ts) and the session.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
};

export default async function ContactPage() {
  // The form is for signed-in readers only (app/api/contact refuses anyone
  // else). A guest, who reaches this from the footer, gets the email address
  // instead of being sent to sign in.
  const session = await getSession();
  if (!session) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="font-display font-bold text-3xl text-ink mb-3">Contact</h1>
        <p className="font-serif text-lg text-moss mb-6 max-w-2xl">
          Have a question, some feedback, or something on the site that isn&apos;t working right?
          Email us at{" "}
          <a href={`mailto:${CONTACT_INBOX}`} className="text-ink underline hover:text-moss">
            {CONTACT_INBOX}
          </a>
          .
        </p>
        <p className="font-serif text-moss max-w-2xl">
          Have an account?{" "}
          <Link href="/login?next=/contact" className="text-ink underline hover:text-moss">
            Log in
          </Link>{" "}
          to send a message from here, with screenshots if they help.
        </p>
      </div>
    );
  }

  const db = await getDb();
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    columns: { fullName: true },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16">
      <h1 className="font-display font-bold text-3xl text-ink mb-3">Contact</h1>
      <p className="font-serif text-lg text-moss mb-10 max-w-2xl">
        Have a comment or some feedback, or found something on the site that isn&apos;t working
        right? Tell us here. Screenshots help us see exactly what you saw.
      </p>
      <ContactForm initialName={user?.fullName ?? ""} initialEmail={session.email} />
    </div>
  );
}
