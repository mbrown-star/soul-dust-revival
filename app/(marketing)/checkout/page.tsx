import { getSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { orders, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { COUNTRIES } from "@/lib/data/countries";
import CheckoutPageClient from "./CheckoutPageClient";

// Needed for the nonce-based CSP in proxy.ts (same reasoning as
// app/(marketing)/account/page.tsx): a Server Component calling getSession()
// already opts into dynamic rendering via cookies(), but this is kept
// explicit for clarity.
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await getSession();
  const country = session ? await knownCountry(session.userId) : "";
  return <CheckoutPageClient initialLoggedIn={!!session} initialCountry={country} />;
}

/**
 * The signed-in account's country, so checkout needn't ask again (staging
 * audit, 2026-11-13): the profile's, else the latest order's. Only a code
 * the Country list offers is used.
 */
async function knownCountry(userId: string): Promise<string> {
  const db = await getDb();
  const [user] = await db.select({ country: users.country }).from(users).where(eq(users.id, userId)).limit(1);
  let code = user?.country ?? null;
  if (!code) {
    const [latest] = await db
      .select({ country: orders.country })
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    code = latest?.country ?? null;
  }
  return code && COUNTRIES.some((c) => c.code === code) ? code : "";
}
