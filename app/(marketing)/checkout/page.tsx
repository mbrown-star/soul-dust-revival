import { getSession } from "@/lib/auth/session";
import CheckoutPageClient from "./CheckoutPageClient";

// Needed for the nonce-based CSP in proxy.ts (same reasoning as
// app/(marketing)/account/page.tsx): a Server Component calling getSession()
// already opts into dynamic rendering via cookies(), but this is kept
// explicit for clarity.
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await getSession();
  return <CheckoutPageClient initialLoggedIn={!!session} />;
}
