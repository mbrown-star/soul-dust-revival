"use client";

import { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AccountPageClient() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmId = useId();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function handleExport() {
    const res = await fetch("/api/account/export");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-data-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    const res = await fetch("/api/account/delete", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message ?? "Couldn't delete your account.");
      setDeleting(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!email) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold">Your account</h1>
        <p className="text-neutral-600 mt-4">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Your account</h1>
        <p className="text-neutral-600 mt-1">{email}</p>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="font-medium mb-1">Export your data</h2>
        <p className="text-sm text-neutral-600 mb-3">
          Download everything we&apos;ve stored about your account — profile, orders,
          study responses, and login history — as a JSON file.
        </p>
        <button onClick={handleExport} className="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm">
          Download my data
        </button>
      </div>

      <div className="border border-red-200 rounded-lg p-4">
        <h2 className="font-medium mb-1 text-red-700">Delete your account</h2>
        <p className="text-sm text-neutral-600 mb-3">
          This permanently removes your ability to log in and deletes your study
          responses and login history. Order records are kept for financial
          record-keeping, with your personal details removed from them. This
          can&apos;t be undone.
        </p>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="text-sm text-red-700 underline"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-3">
            <label htmlFor={confirmId} className="block text-sm font-medium">
              Type <strong>DELETE</strong> to confirm
            </label>
            <input
              id={confirmId}
              className="w-full border rounded-lg p-2 text-sm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
                className="bg-red-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently delete my account"}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                  setError(null);
                }}
                className="text-sm text-neutral-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
