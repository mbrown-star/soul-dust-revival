"use client";

import { useState } from "react";

type Connection = {
  displayName: string | null;
  status: "connected" | "disconnected" | "error";
  lastError: string | null;
} | null;

export function ConnectionsPanel({
  initial,
}: {
  initial: { anthropic: Connection; x: Connection; facebook: Connection; instagram: Connection };
}) {
  const [state, setState] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [connectingClaude, setConnectingClaude] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connectClaude(e: React.FormEvent) {
    e.preventDefault();
    setConnectingClaude(true);
    setError(null);

    const res = await fetch("/api/admin/connections/anthropic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      setError(data.message ?? "Couldn't connect that key.");
      setConnectingClaude(false);
      return;
    }

    setState((s) => ({ ...s, anthropic: { displayName: "Anthropic API", status: "connected", lastError: null } }));
    setApiKey("");
    setConnectingClaude(false);
  }

  async function disconnect(provider: "anthropic" | "x" | "facebook" | "instagram") {
    await fetch("/api/admin/connections/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    setState((s) => ({ ...s, [provider]: { displayName: null, status: "disconnected", lastError: null } }));
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* Claude / Anthropic */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="font-medium">Claude</h2>
            <p className="text-sm text-neutral-600">Powers AI-suggested draft posts.</p>
          </div>
          <StatusBadge status={state.anthropic?.status ?? "disconnected"} />
        </div>
        {state.anthropic?.status === "connected" ? (
          <button onClick={() => disconnect("anthropic")} className="text-sm text-red-600 underline">
            Disconnect
          </button>
        ) : (
          <form onSubmit={connectClaude} className="flex gap-2 mt-2">
            <label htmlFor="anthropic-key" className="sr-only">Anthropic API key</label>
            <input
              id="anthropic-key"
              type="password"
              required
              placeholder="sk-ant-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 border rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <button
              type="submit"
              disabled={connectingClaude}
              className="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              {connectingClaude ? "Connecting..." : "Connect"}
            </button>
          </form>
        )}
      </div>

      {/* X */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="font-medium">X</h2>
            <p className="text-sm text-neutral-600">{state.x?.displayName ?? "Not connected"}</p>
          </div>
          <StatusBadge status={state.x?.status ?? "disconnected"} />
        </div>
        {state.x?.status === "connected" ? (
          <button onClick={() => disconnect("x")} className="text-sm text-red-600 underline">
            Disconnect
          </button>
        ) : (
          <a href="/api/admin/connections/x/authorize" className="inline-block bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm">
            Connect X
          </a>
        )}
      </div>

      {/* Facebook */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="font-medium">Facebook</h2>
            <p className="text-sm text-neutral-600">{state.facebook?.displayName ?? "Not connected"}</p>
          </div>
          <StatusBadge status={state.facebook?.status ?? "disconnected"} />
        </div>
        {state.facebook?.status === "connected" ? (
          <button onClick={() => disconnect("facebook")} className="text-sm text-red-600 underline">
            Disconnect
          </button>
        ) : (
          <a href="/api/admin/connections/facebook/authorize" className="inline-block bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm">
            Connect Facebook
          </a>
        )}
      </div>

      {/* Instagram */}
      <div className="border rounded-lg p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h2 className="font-medium">Instagram</h2>
            <p className="text-sm text-neutral-600">
              {state.instagram?.displayName ?? "Connects automatically with Facebook, if the Page has a linked Instagram professional account"}
            </p>
          </div>
          <StatusBadge status={state.instagram?.status ?? "disconnected"} />
        </div>
        {state.instagram?.status === "connected" && (
          <button onClick={() => disconnect("instagram")} className="text-sm text-red-600 underline">
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "connected" | "disconnected" | "error" }) {
  const styles = {
    connected: "bg-green-100 text-green-800",
    disconnected: "bg-neutral-100 text-neutral-600",
    error: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
}
