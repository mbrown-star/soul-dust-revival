"use client";

import { useState, useId } from "react";
import { logOut } from "@/lib/auth/logOut";
import { appUrl } from "@/lib/domains";
import { formatDate } from "@/lib/format/date";

export type OrderSummary = {
  id: string;
  status: "pending" | "paid" | "refunded";
  totalCents: number;
  createdAt: string | null;
  itemLabels: string[];
};

export type ClaimSummary = {
  id: string;
  title: string;
  amazonOrderNumber: string;
  createdAt: string | null;
};

const STATUS_LABEL: Record<OrderSummary["status"], string> = {
  paid: "Paid",
  pending: "Pending",
  refunded: "Refunded",
};

export default function AccountPageClient({
  email,
  orders,
  claims,
}: {
  email: string;
  orders: OrderSummary[];
  claims: ClaimSummary[];
}) {
  const [confirmText, setConfirmText] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmId = useId();

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
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "Couldn't delete your account.");
      setDeleting(false);
      return;
    }

    // Shared logOut(): clears the session cookies server-side and lands on
    // the marketing homepage with a full page load.
    await logOut();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 sm:py-16 space-y-8">
      <div>
        <h1 className="font-display font-bold text-2xl text-ink">Your account</h1>
        <p className="text-moss mt-1">{email}</p>
        <a href={appUrl("/library")} className="inline-block mt-2 text-sm text-moss hover:text-ink underline underline-offset-2">
          Go to My Library →
        </a>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="font-medium mb-2">Your orders</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-moss">You haven&apos;t placed an order yet.</p>
        ) : (
          <ul className="divide-y">
            {orders.map((order) => (
              <li key={order.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-ink">{order.itemLabels.join(", ") || "Order"}</p>
                  <p className="text-xs text-moss">
                    {/* createdAt isn't actually nullable in practice (defaultNow()
                        on insert), but the column itself allows it -- found in
                        review: the old unconditional "{date} · Order #" left an
                        orphaned leading "· " with no date before it if it ever
                        were null. */}
                    {order.createdAt && `${formatDate(order.createdAt)} · `}
                    Order #{order.id.slice(0, 8)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium text-ink">${(order.totalCents / 100).toFixed(2)}</p>
                  <p
                    className={`text-xs ${order.status === "paid" ? "text-moss" : order.status === "pending" ? "text-ember-700" : "text-error"}`}
                  >
                    {STATUS_LABEL[order.status]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {claims.length > 0 && (
        <section aria-labelledby="claims-heading" className="border rounded-lg p-4">
          <h2 id="claims-heading" className="font-medium mb-1">Bought on Amazon</h2>
          <p className="text-sm text-moss mb-2">Digital editions you unlocked with an Amazon order number.</p>
          <ul className="divide-y">
            {claims.map((claim) => (
              <li key={claim.id} className="py-3">
                <p className="text-sm text-ink">{claim.title}</p>
                <p className="text-xs text-moss">
                  {claim.createdAt && `${formatDate(claim.createdAt)} · `}Amazon order {claim.amazonOrderNumber}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="border rounded-lg p-4">
        <h2 className="font-medium mb-1">Export your data</h2>
        <p className="text-sm text-moss mb-3">
          Download everything we&apos;ve stored about your account — profile, orders,
          study responses, and login history — as a JSON file.
        </p>
        <button onClick={handleExport} className="bg-ink text-white rounded-lg px-4 py-2 text-sm">
          Download my data
        </button>
      </div>

      <div className="border border-error/20 rounded-lg p-4">
        <h2 className="font-medium mb-1 text-error">Delete your account</h2>
        <p className="text-sm text-moss mb-3">
          This permanently removes your ability to sign in and deletes your study
          responses and login history. Order records are kept for financial
          record-keeping, with your personal details removed from them. This
          can&apos;t be undone.
        </p>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="text-sm text-error underline"
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
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={confirmText !== "DELETE" || deleting}
                className="bg-error text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently delete my account"}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                  setError(null);
                }}
                className="text-sm text-moss"
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
