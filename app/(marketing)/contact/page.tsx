import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { ContactForm } from "@/components/contact/ContactForm";

// Per-request render, for the nonce-based CSP (proxy.ts) and the session.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact",
};

export default async function ContactPage() {
  // Linked from the nav for signed-in readers only; its route
  // (app/api/contact) refuses anyone else, so the page does too.
  const session = await getSession();
  if (!session) redirect("/login?next=/contact");

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
