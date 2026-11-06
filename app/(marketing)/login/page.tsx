"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";

function LoginInner() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/library";

  return <AuthForm mode="login" next={next} />;
}

export default function LoginPage() {
  // useSearchParams() opts the tree into client-side rendering for this part
  // of the page, so Next requires a Suspense boundary around it — without
  // this, the production build fails during static generation entirely
  // (this is a real, build-breaking error, not just a lint warning).
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
