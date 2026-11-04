import Link from "next/link";
import { SiteNav } from "./SiteNav";
import { getSession } from "@/lib/auth/session";

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="border-b border-moss/20 bg-parchment no-print">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-display font-black text-lg sm:text-xl text-ink tracking-tight focus:outline-none focus:ring-2 focus:ring-ink rounded"
        >
          Soul Dust <span className="text-ember">Revival</span>
        </Link>
        <SiteNav loggedIn={!!session} />
      </div>
    </header>
  );
}
