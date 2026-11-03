import type { Metadata } from "next";

// See login/layout.tsx -- same reason: page.tsx is a "use client" file, and
// route segment config is silently ignored there.
export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
