import { closedInSneakPeek } from "@/lib/launchMode";

// The store (listing and every product page) is closed on the sneak-peek site.
export default function BooksLayout({ children }: { children: React.ReactNode }) {
  closedInSneakPeek();
  return children;
}
