"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/data/countries";
import { Button } from "@/components/ui/Button";
import { AddUserForm } from "./AddUserForm";
import { BlockedEmailsPanel, type BlockedEmail } from "./BlockedEmailsPanel";

type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: "admin" | "leader" | "user";
  country: string | null;
  createdAt: string | null;
};

function EditUserRow({
  user,
  onSaved,
  onCancel,
}: {
  user: UserRow;
  onSaved: (user: UserRow) => void;
  onCancel: () => void;
}) {
  const emailId = useId();
  const nameId = useId();
  const countryId = useId();

  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [country, setCountry] = useState(user.country ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        email,
        fullName: fullName.trim() || null,
        country: country || null,
      }),
    });
    const data = (await res.json()) as UserRow & { message?: string };

    if (!res.ok) {
      setError(data.message ?? "Couldn't save those changes.");
      setSaving(false);
      return;
    }

    onSaved(data);
    setSaving(false);
  }

  return (
    <tr className="border-b border-moss/10 bg-parchment/50">
      <td colSpan={5} className="py-3">
        <form onSubmit={handleSave} aria-label={`Edit ${user.email}`} className="flex flex-wrap items-end gap-3">
          {error && (
            <p role="alert" className="font-sans text-sm text-error basis-full">
              {error}
            </p>
          )}
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
          <div>
            <label htmlFor={nameId} className="block font-sans text-xs font-medium text-ink mb-1">
              Full name
            </label>
            <input
              id={nameId}
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="border border-moss/30 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
            />
          </div>
          <div>
            <label htmlFor={countryId} className="block font-sans text-xs font-medium text-ink mb-1">
              Country
            </label>
            <select
              id={countryId}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="border border-moss/30 rounded-lg p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink"
            >
              <option value="">Not set</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="font-sans text-sm font-semibold bg-ink text-parchment rounded-lg px-3 py-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="font-sans text-sm text-moss rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function DeleteUserRow({
  user,
  onDeleted,
  onCancel,
}: {
  user: UserRow;
  onDeleted: (result: { blocked: BlockedEmail | null; warning: string | null }) => void;
  onCancel: () => void;
}) {
  const headingRef = useRef<HTMLParagraphElement>(null);
  const blockId = useId();
  const reasonId = useId();
  const [block, setBlock] = useState(false);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Move focus into the confirmation, since it replaces the row the Delete
  // button was in.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, block, reason: block && reason.trim() ? reason.trim() : undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | { blocked?: BlockedEmail | null; authWarning?: string | null; message?: string }
        | null;
      if (!res.ok) {
        setError(data?.message ?? "Couldn't delete that account.");
        setDeleting(false);
        return;
      }
      onDeleted({ blocked: data?.blocked ?? null, warning: data?.authWarning ?? null });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setDeleting(false);
    }
  }

  return (
    <tr className="border-b border-moss/10 bg-parchment/50">
      <td colSpan={5} className="py-3">
        <form onSubmit={handleDelete} aria-label={`Delete ${user.email}`} className="space-y-3">
          <p ref={headingRef} tabIndex={-1} className="font-sans text-sm text-ink focus:outline-none">
            <strong>Delete {user.email}?</strong> This removes their account, saved answers,
            progress, and access to anything they bought. Their orders are kept without their
            name. This can&apos;t be undone.
          </p>
          <div className="flex items-center gap-2">
            <input
              id={blockId}
              type="checkbox"
              checked={block}
              onChange={(e) => setBlock(e.target.checked)}
              className="h-4 w-4 accent-ink"
            />
            <label htmlFor={blockId} className="font-sans text-sm text-ink">
              Also block this email from signing in or signing up again
            </label>
          </div>
          {block && (
            <div className="max-w-md">
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
          )}
          {error && (
            <p role="alert" className="font-sans text-sm text-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" size="sm" disabled={deleting}>
              {deleting ? "Deleting..." : block ? "Delete and block" : "Delete account"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
              Cancel
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export function UserRoleTable({
  initialUsers,
  initialBlocked,
  currentUserId,
}: {
  initialUsers: UserRow[];
  initialBlocked: BlockedEmail[];
  currentUserId: string;
}) {
  const [userList, setUserList] = useState(initialUsers);
  const [blockedList, setBlockedList] = useState(initialBlocked);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const blockedSet = new Set(blockedList.map((b) => b.email));

  async function updateRole(userId: string, role: UserRow["role"]) {
    setSavingId(userId);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "Couldn't update that role.");
      setSavingId(null);
      return;
    }

    setUserList((list) => list.map((u) => (u.id === userId ? { ...u, role } : u)));
    setSavingId(null);
  }

  function handleCreated(newUser: {
    id: string;
    email: string;
    fullName: string | null;
    role: UserRow["role"];
    country: string | null;
    createdAt: string | null;
  }) {
    setUserList((list) => [newUser, ...list]);
  }

  function handleDeleted(user: UserRow, result: { blocked: BlockedEmail | null; warning: string | null }) {
    setUserList((list) => list.filter((u) => u.id !== user.id));
    const { blocked } = result;
    if (blocked) setBlockedList((list) => (list.some((b) => b.id === blocked.id) ? list : [blocked, ...list]));
    setDeletingId(null);
    setNotice(result.warning ?? `Deleted ${user.email}${blocked ? " and blocked the email" : ""}.`);
  }

  function handleSaved(updated: UserRow) {
    setUserList((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
    setEditingId(null);
  }

  return (
    <div className="space-y-6">
      <AddUserForm onCreated={handleCreated} />

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <p role="status" className="text-sm text-moss">
        {notice}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-moss/20 text-sm text-moss">
              <th scope="col" className="py-2 pr-4 font-sans font-medium">Email</th>
              <th scope="col" className="py-2 pr-4 font-sans font-medium">Country</th>
              <th scope="col" className="py-2 pr-4 font-sans font-medium">Joined</th>
              <th scope="col" className="py-2 pr-4 font-sans font-medium">Role</th>
              <th scope="col" className="py-2 font-sans font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {userList.map((u) =>
              editingId === u.id ? (
                <EditUserRow key={u.id} user={u} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
              ) : deletingId === u.id ? (
                <DeleteUserRow
                  key={u.id}
                  user={u}
                  onDeleted={(result) => handleDeleted(u, result)}
                  onCancel={() => setDeletingId(null)}
                />
              ) : (
                <tr key={u.id} className="border-b border-moss/10">
                  <td className="py-3 pr-4 font-sans text-sm">
                    {u.email}
                    {blockedSet.has(u.email.toLowerCase()) && (
                      <span className="ml-2 inline-block rounded bg-error/10 px-1.5 py-0.5 text-xs font-medium text-error">
                        Blocked
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 font-sans text-sm text-moss">{u.country ?? "—"}</td>
                  <td className="py-3 pr-4 font-sans text-sm text-moss">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {u.id === currentUserId ? (
                      <span className="font-sans text-sm text-moss">
                        {u.role} <span className="text-xs">(you)</span>
                      </span>
                    ) : (
                      <label>
                        <span className="sr-only">Role for {u.email}</span>
                        <select
                          value={u.role}
                          disabled={savingId === u.id}
                          onChange={(e) => updateRole(u.id, e.target.value as UserRow["role"])}
                          className="border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
                        >
                          <option value="user">User</option>
                          <option value="leader">Leader</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex gap-4">
                      <button
                        onClick={() => {
                          setDeletingId(null);
                          setEditingId(u.id);
                        }}
                        aria-label={`Edit ${u.email}`}
                        className="font-sans text-sm text-moss underline focus:outline-none focus:ring-2 focus:ring-ink rounded p-2 -m-2"
                      >
                        Edit
                      </button>
                      {/* Not yourself (use your Account page) and not another admin (change their role first). */}
                      {u.id !== currentUserId && u.role !== "admin" && (
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setNotice(null);
                            setDeletingId(u.id);
                          }}
                          aria-label={`Delete ${u.email}`}
                          className="font-sans text-sm text-error underline focus:outline-none focus:ring-2 focus:ring-error rounded p-2 -m-2"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <BlockedEmailsPanel
        blocked={blockedList}
        onBlocked={(row) => setBlockedList((list) => [row, ...list])}
        onUnblocked={(id) => setBlockedList((list) => list.filter((b) => b.id !== id))}
      />
    </div>
  );
}
