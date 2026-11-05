"use client";

import { useId, useState } from "react";
import { COUNTRIES } from "@/lib/data/countries";
import { AddUserForm } from "./AddUserForm";

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

export function UserRoleTable({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserRow[];
  currentUserId: string;
}) {
  const [userList, setUserList] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
              ) : (
                <tr key={u.id} className="border-b border-moss/10">
                  <td className="py-3 pr-4 font-sans text-sm">{u.email}</td>
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
                    <button
                      onClick={() => setEditingId(u.id)}
                      className="font-sans text-sm text-moss underline focus:outline-none focus:ring-2 focus:ring-ink rounded p-2 -m-2"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
