import type { Metadata } from "next";

export const metadata: Metadata = { title: "New social post" };

export default function NewSocialPostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
