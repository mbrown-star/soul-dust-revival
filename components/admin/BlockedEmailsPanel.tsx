"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { formatDate } from "@/lib/format/date";

export type BlockedEmail = {
  id: string;
  email: string;
  reason: string | null;
  createdAt: string | null;
};

/**
 * Emails that can't sign in or sign up. Blocking an existing user's email
 * here keeps their data and bans the account; Delete in the table above
 * removes the account too.
 */
export function BlockedEmailsPanel({
  blocked,
  onBlocked,
  onUnblocked,
}: {
  blocked: BlockedEmail[];
  onBlocked: (row: BlockedEmail) => void;
  onUnblocked: (id: string) => void;
}) {
  const headingId = useId();
  const emailId = useId();
  const reasonId = useId();

  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleBlock(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/blocked-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason: reason.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | (BlockedEmail & { alreadyBlocked?: boolean; authWarning?: string | null; message?: string })
        | null;
      if (!res.ok || !data) {
        setError(data?.message ?? "Couldn't block that email.");
        return;
      }
      if (!data.alreadyBlocked) onBlocked({ id: data.id, email: data.email, reason: data.reason, createdAt: data.createdAt });
      setNotice(data.authWarning ?? (data.alreadyBlocked ? `${data.email} was already blocked.` : `Blocked ${data.email}.`));
      setEmail("");
      setReason("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnblock(row: BlockedEmail) {
    if (!window.confirm(`Unblock ${row.email}? They'll be able to sign in or sign up again.`)) return;
    setUnblockingId(row.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/blocked-emails", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setError(data?.message ?? "Couldn't unblock that email.");
        return;
      }
      onUnblocked(row.id);
      setNotice(`Unblocked ${row.email}.`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setUnblockingId(null);
    }
  }

  return (
    <section aria-labelledby={headingId} className="space-y-4 border-t border-moss/20 pt-6">
      <div>
        <h2 id={headingId} className="font-display text-lg text-ink">
          Blocked emails
        </h2>
        <p className="text-sm text-moss mt-1">
          A blocked email can&apos;t sign in or sign up. Blocking someone who already has an
          account keeps their data and locks them out; use Delete above to remove the account too.
        </p>
      </div>

      <form onSubmit={handleBlock} aria-label="Block an email" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={emailId} className="block font-sans text-xs font-medium text-ink mb-1">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-moss/30 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
          />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor={reasonId} className="block font-sans text-xs font-medium text-ink mb-1">
            Reason (optional, for admins only)
          </label>
          <input
            id={reasonId}
            type="text"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-moss/30 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
          />
        </div>
        <Button type="submit" variant="danger" size="sm" disabled={saving || !email.trim()}>
          {saving ? "Blocking..." : "Block email"}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <p role="status" className="text-sm text-moss">
        {notice}
      </p>

      {blocked.length === 0 ? (
        <p className="text-sm text-moss">No emails are blocked.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-moss/20 text-sm text-moss">
                <th scope="col" className="py-2 pr-4 font-sans font-medium">Email</th>
                <th scope="col" className="py-2 pr-4 font-sans font-medium">Reason</th>
                <th scope="col" className="py-2 pr-4 font-sans font-medium">Blocked</th>
                <th scope="col" className="py-2 font-sans font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {blocked.map((b) => (
                <tr key={b.id} className="border-b border-moss/10">
                  <td className="py-3 pr-4 font-sans text-sm">{b.email}</td>
                  <td className="py-3 pr-4 font-sans text-sm text-moss">{b.reason ?? "—"}</td>
                  <td className="py-3 pr-4 font-sans text-sm text-moss">
                    {b.createdAt ? formatDate(b.createdAt) : "—"}
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => handleUnblock(b)}
                      disabled={unblockingId === b.id}
                      aria-label={`Unblock ${b.email}`}
                      className="font-sans text-sm text-moss underline focus:outline-none focus:ring-2 focus:ring-ink rounded p-2 -m-2 disabled:opacity-50"
                    >
                      {unblockingId === b.id ? "Unblocking..." : "Unblock"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
