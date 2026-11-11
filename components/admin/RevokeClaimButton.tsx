"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Revoke one Amazon claim's digital access, after a confirmation. */
export function RevokeClaimButton({ claimId, label }: { claimId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (!confirm(`Revoke the digital edition of ${label}? They'll lose access, and this order number can't be claimed again.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/amazon-claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: claimId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message ?? "Couldn't revoke. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        aria-label={`Revoke ${label}`}
        className="text-error underline disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ink rounded"
      >
        {busy ? "Revoking..." : "Revoke"}
      </button>
      {error && (
        <p role="alert" className="text-error text-xs mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
