"use client";

import { useId, useState } from "react";
import { COUNTRIES } from "@/lib/data/countries";

type Role = "admin" | "leader" | "user";

export type NewUserRow = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  country: string | null;
  createdAt: string | null;
};

export function AddUserForm({ onCreated }: { onCreated: (user: NewUserRow) => void }) {
  const emailId = useId();
  const nameId = useId();
  const countryId = useId();
  const roleId = useId();

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        role,
        fullName: fullName.trim() || undefined,
        country: country || undefined,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.message ?? "Couldn't create that user.");
      setLoading(false);
      return;
    }

    onCreated(data);
    setEmail("");
    setFullName("");
    setCountry("");
    setRole("user");
    setLoading(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="font-sans text-sm font-medium bg-ink text-parchment rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
      >
        Add user
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Add a new user"
      className="border border-moss/20 rounded-lg p-4 space-y-4 max-w-xl"
    >
      <h2 className="font-sans text-sm font-semibold text-ink">Add user</h2>

      {error && (
        <p role="alert" className="font-sans text-sm text-error">
          {error}
        </p>
      )}

      <div>
        <label htmlFor={emailId} className="block font-sans text-sm font-medium text-ink mb-1">
          Email <span aria-hidden="true" className="text-error">*</span>
          <span className="sr-only"> (required)</span>
        </label>
        <input
          id={emailId}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-moss/30 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
        />
      </div>

      <div>
        <label htmlFor={nameId} className="block font-sans text-sm font-medium text-ink mb-1">
          Full name
        </label>
        <input
          id={nameId}
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full border border-moss/30 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ink"
        />
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label htmlFor={countryId} className="block font-sans text-sm font-medium text-ink mb-1">
            Country
          </label>
          <select
            id={countryId}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full border border-moss/30 rounded-lg p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink"
          >
            <option value="">Not set</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label htmlFor={roleId} className="block font-sans text-sm font-medium text-ink mb-1">
            Role
          </label>
          <select
            id={roleId}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="w-full border border-moss/30 rounded-lg p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink"
          >
            <option value="user">User</option>
            <option value="leader">Leader</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      <p className="font-sans text-xs text-moss">
        We&apos;ll email this address a sign-in link — there&apos;s no password to set.
      </p>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="font-sans text-sm font-semibold bg-ink text-parchment rounded-lg px-4 py-2 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ink"
        >
          {loading ? "Creating..." : "Create user"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={loading}
          className="font-sans text-sm text-moss rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
