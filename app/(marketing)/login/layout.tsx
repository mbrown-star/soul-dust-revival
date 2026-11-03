import type { Metadata } from "next";

// `page.tsx` here is a "use client" file (needs useSearchParams()), and route
// segment config like `metadata` is silently ignored in client files -- this
// layout exists purely to carry it without touching the page itself.
export const metadata: Metadata = {
  title: "Log in",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
