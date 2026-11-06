"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";

function SignupInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/library";

  return <AuthForm mode="signup" next={next} />;
}

export default function SignupPage() {
  // See login/page.tsx for why this Suspense boundary is required, not optional.
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
