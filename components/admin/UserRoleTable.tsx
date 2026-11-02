"use client";

import { useState } from "react";

type UserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: "admin" | "leader" | "user";
  country: string | null;
  createdAt: string | null;
};

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

  async function updateRole(userId: string, role: UserRow["role"]) {
    setSavingId(userId);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message ?? "Couldn't update that role.");
      setSavingId(null);
      return;
    }

    setUserList((list) => list.map((u) => (u.id === userId ? { ...u, role } : u)));
    setSavingId(null);
  }

  return (
    <div>
      {error && (
        <p role="alert" className="text-sm text-ember mb-4">
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
              <th scope="col" className="py-2 font-sans font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {userList.map((u) => (
              <tr key={u.id} className="border-b border-moss/10">
                <td className="py-3 pr-4 font-sans text-sm">{u.email}</td>
                <td className="py-3 pr-4 font-sans text-sm text-moss">{u.country ?? "—"}</td>
                <td className="py-3 pr-4 font-sans text-sm text-moss">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                </td>
                <td className="py-3">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
